import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  addQuestion,
  applyRun,
  EMPTY_PREP,
  keepQuestion,
  parsePrep,
  type Prep,
  prepPrompt,
  readPrep,
  recentLines,
  removeQuestion,
  spokenEnglish,
} from "../lib/prep/prep";

const lines = [
  { id: "a", text: "参加率は3年で半分になりました", audioStartMs: 60_000 },
  { id: "b", text: "休日に移すと費用は約2割増えました", audioStartMs: 120_000 },
  { id: "c", text: "隣町は学校と組みました", audioStartMs: null },
];

const open = (id: string, text: string): Prep["questions"][number] => ({ id, text, source: "model", run: 1 });

describe("reading the model's answer", () => {
  it("takes the JSON out of a fence or a sentence", () => {
    const body = '{"summary":["要点"],"answered":[{"id":"q1","line":2}],"questions":[{"text":"質問"}]}';
    expect(parsePrep(body)?.answered).toEqual([{ id: "q1", line: 2 }]);
    expect(parsePrep("```json\n" + body + "\n```")?.summary).toEqual(["要点"]);
    expect(parsePrep("はい。\n" + body)?.questions).toEqual([{ text: "質問" }]);
  });

  it("splits a summary given as one item of many lines", () => {
    const raw = JSON.stringify({ summary: ["- 参加者が減った\n・平日開催が原因\n1. 休日を検討"], questions: [] });
    expect(parsePrep(raw)?.summary).toEqual(["参加者が減った", "平日開催が原因", "休日を検討"]);
  });

  it("refuses what is not an answer, and drops the pieces that are not one", () => {
    expect(parsePrep("そのような内容はありません")).toBeNull();
    expect(parsePrep('{"note":"nothing"}')).toBeNull();
    const parsed = parsePrep('{"summary":["要点",3],"answered":[{"id":1,"line":"x"}],"questions":[{"en":"no text"}]}');
    expect(parsed).toEqual({ summary: ["要点"], answered: [], questions: [] });
  });
});

describe("a finished run", () => {
  it("strikes a question through only on a line that exists", () => {
    const prep = { ...EMPTY_PREP, nextId: 3, questions: [open("q1", "費用は？"), open("q2", "年代は？")] };
    const next = applyRun(
      prep,
      { summary: [], answered: [{ id: "q1", line: 2 }, { id: "q2", line: 99 }], questions: [] },
      lines,
      0,
      false,
    );
    expect(next.questions[0].answered).toEqual({ lineId: "b", ms: 120_000 });
    expect(next.questions[1].answered).toBeUndefined();
  });

  it("leaves a kept question alone", () => {
    const prep = { ...EMPTY_PREP, questions: [{ ...open("q1", "費用は？"), kept: true }] };
    const next = applyRun(prep, { summary: [], answered: [{ id: "q1", line: 1 }], questions: [] }, lines, 0, false);
    expect(next.questions[0].answered).toBeUndefined();
  });

  it("does not repeat a question it already has, however it is punctuated", () => {
    const prep = { ...EMPTY_PREP, nextId: 2, questions: [open("q1", "費用は誰が負担しましたか？")] };
    const next = applyRun(
      prep,
      { summary: [], answered: [], questions: [{ text: "費用は誰が負担しましたか" }, { text: "窓口はどこ？" }] },
      lines,
      0,
      false,
    );
    expect(next.questions.map((q) => q.id)).toEqual(["q1", "q2"]);
  });

  it("keeps the last summary when a run offers none, and moves the marker to the newest timed line", () => {
    const prep = { ...EMPTY_PREP, summary: ["前の要約"] };
    const next = applyRun(prep, { summary: [], answered: [], questions: [] }, lines, 2, false);
    expect(next.summary).toEqual(["前の要約"]);
    expect(next.throughMs).toBe(120_000);
    expect(next.skipped).toBe(2);
    expect(next.runs).toBe(1);
  });

  it("clears the last error", () => {
    const prep = { ...EMPTY_PREP, error: "failed" };
    expect(applyRun(prep, { summary: ["a"], answered: [], questions: [] }, lines, 0, false).error).toBeUndefined();
  });

  it("drops the oldest of the model's own past six, never yours", () => {
    const mine = { ...open("mine", "自分の質問"), source: "you" as const };
    const own = Array.from({ length: 6 }, (_, i) => open(`q${i + 1}`, `質問${i + 1}`));
    const prep = { ...EMPTY_PREP, nextId: 7, questions: [mine, ...own] };
    const next = applyRun(prep, { summary: [], answered: [], questions: [{ text: "新しい質問" }] }, lines, 0, false);
    expect(next.questions.map((q) => q.id)).toEqual(["mine", "q2", "q3", "q4", "q5", "q6", "q7"]);
  });

  it("only keeps the English when it was asked for", () => {
    const answer = { summary: [], answered: [], questions: [{ text: "質問", en: "A question?" }] };
    expect(applyRun(EMPTY_PREP, answer, lines, 0, true).questions[0].en).toBe("A question?");
    expect(applyRun(EMPTY_PREP, answer, lines, 0, false).questions[0].en).toBeUndefined();
  });
});

describe("the person's own changes", () => {
  it("adds, keeps and removes", () => {
    let p = addQuestion({ ...EMPTY_PREP }, "  自分の質問  ");
    expect(p.questions[0]).toMatchObject({ text: "自分の質問", source: "you" });
    p = { ...p, questions: [{ ...p.questions[0], answered: { lineId: "a", ms: 1 } }] };
    p = keepQuestion(p, p.questions[0].id);
    expect(p.questions[0].answered).toBeUndefined();
    expect(p.questions[0].kept).toBe(true);
    expect(removeQuestion(p, p.questions[0].id).questions).toEqual([]);
  });
});

describe("what a run is told", () => {
  const prompt = (withEnglish: boolean) =>
    prepPrompt({ title: "防災訓練", description: null, language: "ja", withEnglish, prep: EMPTY_PREP, lines });

  it("numbers the lines from one, which is what the answer refers to", () => {
    expect(prompt(false).user).toContain("1: 参加率は");
    expect(prompt(false).user).toContain("3: 隣町は");
  });

  it("asks for more when few questions are left open", () => {
    const answered = { ...open("q1", "費用は？"), answered: { lineId: "a", ms: 1 } };
    const all = prepPrompt({
      title: "防災訓練",
      description: null,
      language: "ja",
      withEnglish: false,
      prep: { ...EMPTY_PREP, questions: [answered] },
      lines,
    });
    expect(all.system).toContain("新しい質問を3つ");
    const some = prepPrompt({
      title: "防災訓練",
      description: null,
      language: "ja",
      withEnglish: false,
      prep: { ...EMPTY_PREP, questions: [open("q1", "a"), open("q2", "b"), open("q3", "c")] },
      lines,
    });
    expect(some.system).toContain("新しい質問を1つ");
  });

  it("asks for English only for a talk in English", () => {
    expect(prompt(true).system).toContain("en");
    expect(prompt(true).system).toContain("英語の質問");
    expect(prompt(false).system).not.toContain("英語の質問");
  });
});

describe("whether a talk is in English", () => {
  it("believes the meeting's own language", () => {
    expect(spokenEnglish([{ text: "こんにちは" }], "en")).toBe(true);
    expect(spokenEnglish([{ text: "hello there" }], "ja")).toBe(false);
  });

  it("goes by the letters on auto, past a few English terms in Japanese", () => {
    expect(spokenEnglish([{ text: "The results were better than we expected." }], "auto")).toBe(true);
    expect(spokenEnglish([{ text: "RAG の精度を上げるために、埋め込みを見直しました。" }], null)).toBe(false);
    expect(spokenEnglish([], null)).toBe(false);
  });
});

describe("what fits in one run", () => {
  it("takes the newest lines and says how many it left", () => {
    const many = Array.from({ length: 200 }, (_, i) => ({ text: `${i}`.padEnd(100, "あ") }));
    const { lines: kept, skipped } = recentLines(many);
    expect(kept.at(-1)).toBe(many.at(-1));
    expect(skipped).toBe(many.length - kept.length);
    expect(skipped).toBeGreaterThan(0);
  });

  it("reads a normal run whole", () => {
    expect(recentLines(lines).skipped).toBe(0);
  });
});

describe("what is stored", () => {
  it("survives a body it cannot read", () => {
    expect(readPrep("🔒 encrypted")).toEqual(EMPTY_PREP);
    expect(readPrep(null)).toEqual(EMPTY_PREP);
  });

  it("is encrypted like the minutes, and belongs through the meeting", () => {
    const client = readFileSync(join(__dirname, "../lib/prisma.ts"), "utf8");
    expect(client).toContain('meetingPrep: { field: "body", purpose: "prep" }');
    expect(client).toMatch(/VIA_MEETING = new Set\(\[[\s\S]*?"meetingPrep"/);
  });
});
