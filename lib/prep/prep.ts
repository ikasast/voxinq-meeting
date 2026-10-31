import { estTokens } from "@/lib/llm/context";

// Getting ready for the questions at the end of a talk, while the talk is still going.
//
// Minutes come too late for this: they start when the recording ends, and the questions are
// taken the moment the speaker stops. So each run here reads only what has been said since the
// last one, with the summary so far standing in for everything before it, and that is what lets
// a one-hour talk cost the same per run as a ten-minute one.
//
// A question can be answered by the speaker a minute after it was thought of, so each run is
// also asked which of the open questions the new lines answered. That judgment is the model's
// and it can be wrong, so it has to name the line it rests on, a line that does not exist is
// ignored, and an answered question is struck through rather than removed. Somebody who
// disagrees keeps it with one press, and it is not judged again.

export type PrepQuestion = {
  id: string;
  /** In the language minutes are written in. */
  text: string;
  /** The same question in English, for a talk given in English. */
  en?: string;
  source: "model" | "you";
  answered?: { lineId: string; ms: number | null };
  /** Kept by hand: never struck through again. */
  kept?: boolean;
  /** Which run thought of it, so the screen can mark what is new. */
  run: number;
};

export type Prep = {
  summary: string[];
  questions: PrepQuestion[];
  /** Runs that have finished, which also numbers the questions. */
  runs: number;
  nextId: number;
  /** How far into the recording the last run read, for "up to 23:50". */
  throughMs: number | null;
  /** Older lines that did not fit in the last run. */
  skipped: number;
  /** Why the last run wrote nothing, until one does. */
  error?: string;
};

export const EMPTY_PREP: Prep = { summary: [], questions: [], runs: 0, nextId: 1, throughMs: null, skipped: 0 };

export type PrepLine = { id: string; text: string; audioStartMs: number | null };

/** Open questions the model's own ideas may fill. Yours do not count: they are yours. */
const MAX_OPEN = 6;
const MAX_SUMMARY = 5;
const MAX_NEW_QUESTIONS = 3;
/** Fewer open questions than this, and a run is asked to make up the number. */
const ENOUGH_OPEN = 3;
const MIN_NEW_QUESTIONS = 1;
const MAX_TEXT = 300;
/** New lines one run reads, in `estTokens`. About 24 minutes of speech at 300 characters a minute. */
const LINES_BUDGET = 4000;

export function readPrep(body: string | null | undefined): Prep {
  if (!body) return { ...EMPTY_PREP };
  try {
    const v = JSON.parse(body) as Partial<Prep>;
    return {
      ...EMPTY_PREP,
      ...v,
      summary: Array.isArray(v.summary) ? v.summary : [],
      questions: Array.isArray(v.questions) ? v.questions : [],
    };
  } catch {
    // What reaches here without a key is a padlock, not JSON.
    return { ...EMPTY_PREP };
  }
}

/**
 * Was this talk in English?
 *
 * The meeting's own language when it has one. On "auto" the letters decide: a Japanese talk
 * full of English terms still has far more kana and kanji than Latin letters.
 */
export function spokenEnglish(lines: { text: string }[], sttLanguage: string | null | undefined): boolean {
  if (sttLanguage === "en") return true;
  if (sttLanguage === "ja") return false;
  let latin = 0;
  let other = 0;
  for (const { text } of lines) {
    for (const c of text) {
      if (/[a-z]/i.test(c)) latin += 1;
      else if (/\p{L}/u.test(c)) other += 1;
    }
  }
  return latin > 0 && latin > other * 2;
}

/**
 * The newest lines that fit. A run is normally a few minutes' worth; this bounds the one that
 * was switched on an hour into a talk, and the older lines it leaves out are reported.
 */
export function recentLines<T extends { text: string }>(lines: T[]): { lines: T[]; skipped: number } {
  let spent = 0;
  let from = lines.length;
  while (from > 0) {
    spent += estTokens(lines[from - 1].text);
    if (spent > LINES_BUDGET) break;
    from -= 1;
  }
  return { lines: lines.slice(from), skipped: from };
}

export function prepPrompt(input: {
  title: string;
  description: string | null;
  language: "ja" | "en";
  /** Ask for each question in English as well. */
  withEnglish: boolean;
  prep: Prep;
  lines: PrepLine[];
}): { system: string; user: string } {
  const { title, description, language, withEnglish, prep, lines } = input;
  const open = prep.questions.filter((q) => !q.answered);
  // Asked for outright: left to itself, a model that has just struck out every question offers
  // none, and the list is empty at the moment it is needed.
  const wanted = Math.max(MIN_NEW_QUESTIONS, ENOUGH_OPEN - open.length);
  const system = [
    "あなたは講演や会議の聴き手を助けるアシスタントです。話の途中までの文字起こしを読み、質疑で聞く価値のある質問を用意します。",
    `summary と questions の text は${language === "en" ? "英語" : "日本語"}で書くこと。`,
    withEnglish
      ? "話者は英語で話しています。質問は実際に英語で口にするので、questions の各項目に en として自然で簡潔な英語の質問も付けること。"
      : "",
    "文字起こしは音声認識の結果で、誤字を含みます。書かれていない事実や数値を作らないこと。",
    "出力は次の形の JSON のみ。説明や前置きは書かないこと。",
    withEnglish
      ? '{"summary":["ここまでの要点"],"answered":[{"id":"q1","line":12}],"questions":[{"text":"質問","en":"The question in English"}]}'
      : '{"summary":["ここまでの要点"],"answered":[{"id":"q1","line":12}],"questions":[{"text":"質問"}]}',
    `summary: これまでの要点を${MAX_SUMMARY}項目以内の配列で。1項目は1文で短く。前回の要約に今回の内容を織り込み、書き直すこと。`,
    "answered: 未回答の質問のうち、今回の発言で実際に答えられたものだけ。id は質問の id、line はその答えが述べられた発言の番号。少しでも疑わしければ入れないこと。",
    `questions: 今回の内容から考えられる新しい質問を${wanted}つ。すでに答えられたことや、既存の質問と同じ内容は書かないこと。講演者の考えや、具体例、次の段階を尋ねる質問も歓迎。`,
  ]
    .filter(Boolean)
    .join("\n");

  const user = [
    `題名: ${title}`,
    description ? `概要: ${description}` : "",
    "",
    prep.summary.length ? `前回までの要約:\n${prep.summary.map((s) => `- ${s}`).join("\n")}` : "前回までの要約: なし（最初の回です）",
    "",
    open.length ? `未回答の質問:\n${open.map((q) => `${q.id}: ${q.text}`).join("\n")}` : "未回答の質問: なし",
    "",
    "今回の発言（番号: 内容）:",
    ...lines.map((l, i) => `${i + 1}: ${l.text}`),
  ]
    .filter((s, i) => s !== "" || i > 1)
    .join("\n");
  return { system, user };
}

export type PrepAnswer = {
  summary: string[];
  answered: { id: string; line: number }[];
  questions: { text: string; en?: string }[];
};

function stripFence(s: string): string {
  const m = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = (m ? m[1] : s).trim();
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  return start >= 0 && end > start ? body.slice(start, end + 1) : body;
}

const clean = (v: unknown): string => (typeof v === "string" ? v.trim().slice(0, MAX_TEXT) : "");

/** What the model answered, or null when it cannot be read as an answer at all. */
export function parsePrep(raw: string): PrepAnswer | null {
  let v: unknown;
  try {
    v = JSON.parse(stripFence(raw));
  } catch {
    return null;
  }
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (!Array.isArray(o.summary) && !Array.isArray(o.questions)) return null;
  // Some models give one item with a line for each point, whatever the shape asked for.
  const summary = (Array.isArray(o.summary) ? o.summary : [])
    .flatMap((s) => (typeof s === "string" ? s.split("\n") : []))
    .map((s) => clean(s.replace(/^\s*(?:[-・*]|\d+[.)])\s*/, "")))
    .filter(Boolean)
    .slice(0, MAX_SUMMARY);
  const answered = (Array.isArray(o.answered) ? o.answered : []).flatMap((a) => {
    if (!a || typeof a !== "object") return [];
    const { id, line } = a as Record<string, unknown>;
    const n = typeof line === "string" ? Number(line) : line;
    return typeof id === "string" && typeof n === "number" && Number.isInteger(n) ? [{ id, line: n }] : [];
  });
  const questions = (Array.isArray(o.questions) ? o.questions : []).flatMap((q) => {
    if (!q || typeof q !== "object") return [];
    const text = clean((q as Record<string, unknown>).text);
    const en = clean((q as Record<string, unknown>).en);
    return text ? [{ text, ...(en ? { en } : {}) }] : [];
  });
  return { summary, answered, questions: questions.slice(0, MAX_NEW_QUESTIONS) };
}

const sameWords = (s: string) => s.replace(/[\s、。，．,.?？!！「」]/g, "").toLowerCase();

/**
 * One finished run, written onto the prep as it stands now.
 *
 * As it stands *now* rather than as it stood when the run began: a question added or kept during
 * the half minute the model was writing is still there afterwards, and only ids that still exist
 * are touched.
 */
export function applyRun(prep: Prep, answer: PrepAnswer, read: PrepLine[], skipped: number, withEnglish: boolean): Prep {
  const runs = prep.runs + 1;
  const struck = new Map<string, PrepLine>();
  for (const { id, line } of answer.answered) {
    const hit = read[line - 1];
    if (hit) struck.set(id, hit);
  }
  const questions = prep.questions.map((q) => {
    const hit = struck.get(q.id);
    if (!hit || q.answered || q.kept) return q;
    return { ...q, answered: { lineId: hit.id, ms: hit.audioStartMs } };
  });
  let nextId = prep.nextId;
  const seen = new Set(questions.map((q) => sameWords(q.text)));
  for (const q of answer.questions) {
    const key = sameWords(q.text);
    if (seen.has(key)) continue;
    seen.add(key);
    questions.push({
      id: `q${nextId++}`,
      text: q.text,
      ...(withEnglish && q.en ? { en: q.en } : {}),
      source: "model",
      run: runs,
    });
  }
  // Too many to read in a question period helps nobody: the oldest of the model's own go first.
  const open = questions.filter((q) => q.source === "model" && !q.answered && !q.kept);
  const drop = new Set(open.slice(0, Math.max(0, open.length - MAX_OPEN)).map((q) => q.id));
  const lastMs = [...read].reverse().find((l) => typeof l.audioStartMs === "number")?.audioStartMs ?? null;
  const { error: _cleared, ...rest } = prep;
  void _cleared;
  return {
    ...rest,
    summary: answer.summary.length ? answer.summary : prep.summary,
    questions: questions.filter((q) => !drop.has(q.id)),
    runs,
    nextId,
    throughMs: lastMs ?? prep.throughMs,
    skipped,
  };
}

export function addQuestion(prep: Prep, text: string): Prep {
  const q: PrepQuestion = { id: `q${prep.nextId}`, text: text.trim().slice(0, MAX_TEXT), source: "you", run: prep.runs };
  return { ...prep, nextId: prep.nextId + 1, questions: [...prep.questions, q] };
}

/** "It was not really answered": back with the open ones, and left alone from now on. */
export function keepQuestion(prep: Prep, id: string): Prep {
  return {
    ...prep,
    questions: prep.questions.map((q) => {
      if (q.id !== id) return q;
      const { answered: _answered, ...rest } = q;
      void _answered;
      return { ...rest, kept: true };
    }),
  };
}

export function removeQuestion(prep: Prep, id: string): Prep {
  return { ...prep, questions: prep.questions.filter((q) => q.id !== id) };
}
