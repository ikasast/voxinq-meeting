import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { conversationText } from "@/lib/llm";

// Asking a question of one meeting's own words, rather than of its minutes.
//
// The minutes are the reviewed version and the dense one, which is why a whole series of them
// fits in a local model's context. A transcript does not: an hour of Japanese is ten to
// thirteen thousand tokens against a budget of twenty-four, so this is one meeting at a time,
// and a long one is condensed first rather than truncated.

const read = (p: string) => readFileSync(join(__dirname, "..", p), "utf8");

describe("the meeting as a prompt reads it", () => {
  const rows = [
    { speakerType: "self", text: "予算はどのくらい残っていますか", createdAt: new Date() },
    { speakerType: "partner-0", text: "三万円ほどです", createdAt: new Date() },
  ];

  it("names the speakers when there is more than one", () => {
    expect(conversationText(rows, { "partner-0": "田中" })).toBe(
      "Me: 予算はどのくらい残っていますか\n田中: 三万円ほどです",
    );
  });

  it("says nothing about the speaker when only one was ever distinguished", () => {
    // Prefixing every line with the same name is noise, and it leaks into what is written.
    const one = [rows[0], { ...rows[1], speakerType: "self" }];
    expect(conversationText(one)).toBe("予算はどのくらい残っていますか\n三万円ほどです");
  });
});

describe("asking of a transcript", () => {
  const ask = read("lib/llm/ask.ts");
  const route = read("app/api/ask/route.ts");

  it("condenses a meeting too long to read at once, rather than cutting it off", () => {
    // The same map-reduce the minutes use, so the far half of a long meeting is answered from.
    expect(ask).toContain("condenseTranscript(provider, cfg, source, avail, language, signal)");
    expect(ask).toContain("condensed = true");
  });

  it("asks for the context budget in force, not the constant", () => {
    // Somebody with a bigger card raises it in settings; the constant is only the default.
    expect(ask).toContain("ollamaContextBudget(cfg.ollamaNumCtx)");
  });

  it("answers only from the meeting, and says so when it cannot", () => {
    expect(ask).toContain("記録には見当たりません");
    expect(ask).toContain("発言ログに無い事業名・組織・人物・数値を新たに作り出さないこと。");
  });

  it("is one meeting only", () => {
    // A series of transcripts is several times any local model's context.
    expect(route).toContain('if (!meetingId) return apiError("meetingId is required to read a transcript", 400)');
    expect(route).toContain("This meeting has no transcript to read.");
  });
});

describe("the Ask box", () => {
  const ui = read("app/ask-minutes.tsx");
  const page = read("app/[id]/page.tsx");

  it("offers the choice only where both exist", () => {
    expect(ui).toContain("meetingId && hasTranscript && hasMinutes");
    expect(ui).toContain('t("From the transcript")');
  });

  it("starts on the minutes when there are any, and on the transcript when there are not", () => {
    expect(ui).toContain('useState<Source>(hasMinutes ? "minutes" : "transcript")');
  });

  it("appears for a meeting that is recorded but not written up yet", () => {
    // Which is most of a conference week, and exactly when the question is about what was said.
    expect(page).toContain("meeting.summaries.length > 0 || meeting.transcripts.length > 0");
    expect(page).toContain("hasTranscript={meeting.transcripts.length > 0}");
  });

  it("says which it read", () => {
    expect(ui).toContain('t("Based on everything said in this meeting.")');
  });
});
