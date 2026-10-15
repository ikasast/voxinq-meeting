import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { cleanCriteria, defaultCriteria, overallScore } from "@/lib/review/criteria";
import { reviewMetrics } from "@/lib/review/metrics";
import { focusLines, parseReview, type ReviewLine } from "@/lib/review/prompt";

// Meeting feedback (an extension): criteria, the counted facts, the model's answer read with
// suspicion, and the score out of 100.

const read = (p: string) => readFileSync(join(__dirname, "..", p), "utf8");

describe("the criteria", () => {
  it("come built in for both roles, in both languages", () => {
    expect(defaultCriteria("facilitator", "ja").map((c) => c.id)).toContain("inclusion");
    expect(defaultCriteria("participant", "en")[0].name).toBe("Clarity");
    expect(defaultCriteria("facilitator", "ja").length).toBeGreaterThan(defaultCriteria("participant", "ja").length);
  });

  it("are cleaned when saved: no empty names, weights 1–3, unique ids", () => {
    const c = cleanCriteria([
      { id: "a", name: "  One ", description: "x", weight: 9 },
      { id: "a", name: "Two", weight: 0 },
      { name: "" },
      "nonsense",
    ]);
    expect(c).toEqual([
      { id: "a", name: "One", description: "x", weight: 3 },
      { id: "a_", name: "Two", description: "", weight: 1 },
    ]);
    expect(cleanCriteria("no")).toBeNull();
  });

  it("score out of 100: all ones is 0, all fives is 100, weighted between", () => {
    const crit = [
      { id: "a", name: "A", description: "", weight: 2 },
      { id: "b", name: "B", description: "", weight: 1 },
    ];
    expect(overallScore(crit, { a: 1, b: 1 })).toBe(0);
    expect(overallScore(crit, { a: 5, b: 5 })).toBe(100);
    expect(overallScore(crit, { a: 5, b: 1 })).toBe(67);
    // A criterion the model left out does not count either way.
    expect(overallScore(crit, { b: 5 })).toBe(100);
  });
});

describe("the counted facts", () => {
  const L = (speaker: string, text: string, s: number, e: number) => ({ speaker, text, startSec: s, endSec: e });
  it("are this person's share, turns, questions and longest turn", () => {
    const m = reviewMetrics(
      [L("A", "では始めます。進捗はどうですか？", 0, 5), L("A", "続けます", 5, 30), L("B", "順調です", 30, 40), L("A", "次は？", 40, 45)],
      "A",
    );
    expect(m.turns).toBe(2);
    expect(m.questions).toBe(2);
    expect(m.longestTurnSec).toBe(30);
    expect(m.speakers).toBe(2);
    expect(m.share).toBeGreaterThan(50);
    expect(m.quietestOtherShare).toBeLessThan(50);
  });
});

describe("the model's answer", () => {
  const crit = defaultCriteria("participant", "en");
  const shown: ReviewLine[] = [
    { id: "l1", speaker: "A", text: "x", at: "0:00" },
    { id: "l2", speaker: "B", text: "y", at: "0:10" },
  ];

  it("is read from a fence, and only what checks out is kept", () => {
    const raw =
      "Sure:\n```json\n" +
      JSON.stringify({
        criteria: [
          { id: "clarity", score: 7, comment: "c" },
          { id: "invented", score: 3 },
          { id: "clarity", score: 1 },
          { id: "focus", score: "2" },
        ],
        strengths: [{ text: "good", lines: [0, 1, 99] }],
        improvements: [{ text: "" }, { text: "better", lines: [] }],
        summary: "s",
      }) +
      "\n```";
    const r = parseReview(raw, crit, shown)!;
    expect(r.criteria).toEqual([
      { id: "clarity", score: 5, comment: "c" },
      { id: "focus", score: 2, comment: "" },
    ]);
    expect(r.strengths).toEqual([{ text: "good", lineIds: ["l1", "l2"] }]);
    expect(r.improvements).toEqual([{ text: "better", lineIds: [] }]);
  });

  it("is refused when nothing in it is a score", () => {
    expect(parseReview("I think it went well.", crit, shown)).toBeNull();
    expect(parseReview(JSON.stringify({ criteria: [{ id: "nope", score: 3 }] }), crit, shown)).toBeNull();
  });
});

describe("a long meeting", () => {
  it("is cut down to this person's lines and their neighbours", () => {
    const lines: ReviewLine[] = Array.from({ length: 200 }, (_, i) => ({
      id: `l${i}`,
      speaker: i % 10 === 0 ? "A" : "B",
      text: "x".repeat(50),
      at: null,
    }));
    const all = focusLines(lines, "A", 1_000_000);
    expect(all.focused).toBe(false);
    const some = focusLines(lines, "A", 3000);
    expect(some.focused).toBe(true);
    expect(some.lines.some((l) => l.speaker === "A")).toBe(true);
    expect(some.lines.length).toBeLessThan(lines.length);
  });
});

describe("where it lives", () => {
  it("is scoped to the meeting's owner and encrypted like the minutes", () => {
    const prisma = read("lib/prisma.ts");
    expect(prisma).toContain('meetingReview: { field: "result", purpose: "review" }');
    expect(prisma).toMatch(/VIA_MEETING = new Set\(\[[\s\S]*?"meetingReview"/);
  });

  it("runs in the queue, and gives way to a recording", () => {
    expect(read("lib/queue/types.ts")).toContain('"review"');
    expect(read("lib/queue/dispatcher.ts")).toContain('case "review":');
    expect(read("lib/queue/capacity.ts")).toContain('kind === "minutes" || kind === "review"');
  });

  it("is switched off with its extension, everywhere", () => {
    expect(read("app/api/meetings/[id]/reviews/route.ts")).toContain('extensionOff("review")');
    expect(read("app/api/reviews/[id]/route.ts")).toContain('extensionOff("review")');
    expect(read("app/reviews/page.tsx")).toContain('extensionEnabled("review")');
    expect(read("lib/queue/runners/review.ts")).toContain('extensionEnabled("review")');
  });
});
