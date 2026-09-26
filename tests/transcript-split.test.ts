import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { asRecognised, joinPieces, planMerges, planSplits, withCurrentText } from "@/lib/meetings/split";

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
    // ...and judges the pieces against the text the lines have when the answer comes back.
    expect(src).toContain("withCurrentText(rows, now)");
    expect(src).toContain("planSplits(current, result.pieces");
  });

  it("asks about the lines as recognised, and changes nothing until it has an answer", () => {
    expect(src).toContain("asRecognised(stored)");
    // The earlier division is put back only after the diarizer has answered.
    expect(src.indexOf("undoSplits(meetingId)")).toBeGreaterThan(src.indexOf("sttWait("));
  });

  it("says what it did, because the transcript now has more lines than it did", () => {
    expect(src).toContain("were divided, adding");
  });
});

// Putting lines back together. The two ways this went wrong in 3.8.0 were found by running it:
// an English line came back as "the date?Yes", and a meeting diarized twice ended with a piece
// Undo split could not reach.

const stored = (id: string, text: string, splitOfId: string | null = null, audioEndMs = 1000) => ({
  id,
  text,
  audioEndMs,
  splitOfId,
});

describe("joining the pieces of a line", () => {
  it("puts back the space an English line had", () => {
    expect(joinPieces(["Can we confirm the date?", "Yes we can."])).toBe("Can we confirm the date? Yes we can.");
  });

  it("joins Japanese the way it is written, without one", () => {
    expect(joinPieces(["それでいいですか", "はい"])).toBe(
      "それでいいですかはい",
    );
  });

  it("does not put a space between Japanese and a word beside it", () => {
    // Either side written without spaces is enough to join directly.
    expect(joinPieces(["API の設計は", "OK"])).toBe("API の設計はOK");
  });

  it("ignores empty pieces and stray spacing", () => {
    expect(joinPieces(["  first ", "", " second"])).toBe("first second");
  });
});

describe("which lines go back together", () => {
  it("merges each divided line into the line in front of it", () => {
    const plans = planMerges([
      stored("a", "Can we confirm the date?", null, 2000),
      stored("a1", "Yes we can.", "a", 4000),
      stored("b", "Next topic.", null, 8000),
    ]);
    expect(plans).toEqual([
      { keepId: "a", text: "Can we confirm the date? Yes we can.", audioEndMs: 4000, removeIds: ["a1"] },
    ]);
  });

  it("reaches a piece that was divided again", () => {
    // The state a second diarization left behind in 3.8.0: "we can." points at "Yes", which is
    // itself a piece. Following pointers never got there; the order does.
    const plans = planMerges([
      stored("a", "Can we confirm the date?", null),
      stored("a1", "Yes", "a"),
      stored("a2", "we can.", "a1", 4000),
    ]);
    expect(plans[0].text).toBe("Can we confirm the date? Yes we can.");
    expect(plans[0].removeIds).toEqual(["a1", "a2"]);
  });

  it("reaches a piece whose own line was merged away", () => {
    // What one press of Undo split left in that state: a piece pointing at nothing.
    const plans = planMerges([stored("a", "Can we confirm the date? Yes", null), stored("a2", "we can.", "gone")]);
    expect(plans[0].text).toBe("Can we confirm the date? Yes we can.");
  });

  it("has nothing to do when nothing was divided", () => {
    expect(planMerges([stored("a", "One."), stored("b", "Two.")])).toEqual([]);
  });
});

describe("what a second diarization asks about", () => {
  it("is the lines as they were recognised, not the pieces", () => {
    const rows = asRecognised([
      stored("a", "Can we confirm the date?", null, 2000),
      stored("a1", "Yes we can.", "a", 4000),
      stored("b", "Next topic.", null, 8000),
    ]);
    expect(rows.map((r) => [r.id, r.text, r.audioEndMs])).toEqual([
      ["a", "Can we confirm the date? Yes we can.", 4000],
      ["b", "Next topic.", 8000],
    ]);
  });
});

describe("judging the answer", () => {
  it("uses the text a line has now, so a correction made meanwhile is not written over", () => {
    const asked = [row({ id: "r1", text: "Please send the report by Friday. Sure." })];
    const now = withCurrentText(asked, [{ id: "r1", text: "Please send the report by Thursday. Sure." }]);
    const answer = [
      [
        { speaker: "speaker0", text: "Please send the report by Friday.", start: 0, end: 2 },
        { speaker: "speaker1", text: "Sure.", start: 2.1, end: 3 },
      ],
    ];
    // Against the old words it would be divided -- and "Thursday" lost. Against the new, not.
    expect(planSplits(asked, answer)).toHaveLength(1);
    expect(planSplits(now, answer)).toHaveLength(0);
  });

  it("gives a line that has gone nothing to match", () => {
    expect(withCurrentText([row({ id: "r9" })], [])[0].text).toBe("");
  });
});
