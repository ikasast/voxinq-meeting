import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { planSplits } from "@/lib/meetings/split";

// Dividing a line between the people who spoke in it.
//
// Every refusal here leaves a line exactly as it is; every wrong acceptance rewrites one. So
// these are mostly about what is refused — an edited line above all, where rewriting from the
// recogniser's words would throw somebody's correction away without saying so.

const row = (over: Partial<{ id: string; text: string; createdAt: Date }> = {}) => ({
  id: "r1",
  text: "はいそれでいいですでは",
  createdAt: new Date("2026-09-25T01:00:00.000Z"),
  ...over,
});

const pieces = [
  { speaker: "speaker0", text: "はい", start: 4.2, end: 4.6 },
  { speaker: "speaker1", text: "それでいいです", start: 5.4, end: 6.8 },
  { speaker: "speaker0", text: "では", start: 8.6, end: 9.0 },
];

describe("planning a split", () => {
  it("turns the diarizer's pieces into rows, in milliseconds and speaker keys", () => {
    expect(planSplits([row()], [pieces])).toEqual([
      {
        rowId: "r1",
        pieces: [
          { speaker: "partner-0", text: "はい", audioStartMs: 4200, audioEndMs: 4600 },
          { speaker: "partner-1", text: "それでいいです", audioStartMs: 5400, audioEndMs: 6800 },
          { speaker: "partner-0", text: "では", audioStartMs: 8600, audioEndMs: 9000 },
        ],
      },
    ]);
  });

  it("leaves a line alone when somebody has edited it", () => {
    // The pieces are the recogniser's words. They no longer add up to a line a person has
    // corrected, and that correction is worth more than the split.
    expect(planSplits([row({ text: "はい、それで良いです。では" })], [pieces])).toEqual([]);
  });

  it("does not mind how the pieces are spaced", () => {
    // English words arrive with a leading space; the line was saved without the seam.
    const spaced = [
      { speaker: "speaker0", text: "Sure", start: 1, end: 1.4 },
      { speaker: "speaker1", text: " go ahead", start: 1.6, end: 2.2 },
    ];
    expect(planSplits([row({ text: "Sure go ahead" })], [spaced])).toHaveLength(1);
  });

  it("leaves alone what cannot be divided", () => {
    expect(planSplits([row()], [null])).toEqual([]);
    expect(planSplits([row()], [undefined])).toEqual([]);
    expect(planSplits([row()], [[pieces[0]]])).toEqual([]); // one piece is the line itself
    // Every piece on the same speaker: nothing to divide, whatever the diarizer returned.
    const oneVoice = [
      { speaker: "speaker0", text: "はい", start: 4.2, end: 4.6 },
      { speaker: "speaker0", text: "それでいいですでは", start: 5.4, end: 9.0 },
    ];
    expect(planSplits([row()], [oneVoice])).toEqual([]);
  });

  it("refuses a piece that is not a piece", () => {
    const empty = [pieces[0], { ...pieces[1], text: "   " }, pieces[2]];
    expect(planSplits([row()], [empty])).toEqual([]);
    const backwards = [pieces[0], { ...pieces[1], start: 6.8, end: 5.4 }, pieces[2]];
    expect(planSplits([row()], [backwards])).toEqual([]);
  });

  it("takes each line's pieces, and skips the lines that have none", () => {
    const rows = [row({ id: "a" }), row({ id: "b", text: "ありがとうございます" })];
    const plans = planSplits(rows, [pieces, null]);
    expect(plans.map((p) => p.rowId)).toEqual(["a"]);
  });
});

describe("the diarize job", () => {
  const src = readFileSync(join(__dirname, "..", "lib/queue/runners/diarize.ts"), "utf8");

  it("divides lines only on the path where the pieces are about the rows it sent", () => {
    expect(src).toContain("spans && Array.isArray(result.pieces)");
    expect(src).toContain("planSplits(rows, result.pieces");
  });

  it("says what it did, because the transcript now has more lines than it did", () => {
    expect(src).toContain("were divided, adding");
  });
});
