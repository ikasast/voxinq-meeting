import { describe, expect, it } from "vitest";
import { audioPosition, displayOffset, type PositionRow } from "../lib/audio-position";

/** Rows a second apart in wall-clock, which is what the old estimate keyed off. */
function rows(specs: { start?: number | null; atSec: number }[]): PositionRow[] {
  return specs.map((s) => ({
    createdAt: new Date(Date.UTC(2026, 7, 15, 5, 0, s.atSec)).toISOString(),
    audioStartMs: s.start === undefined ? null : s.start,
  }));
}

describe("audioPosition", () => {
  it("uses the offset stored with the utterance", () => {
    const r = rows([{ start: 1400, atSec: 0 }, { start: 13400, atSec: 6 }]);
    expect(audioPosition(r, 1, { segments: [{ start: 99, end: 99 }, { start: 99, end: 99 }] })).toBe(
      13.4,
    );
  });

  it("falls back to the recording's boundaries by position", () => {
    const r = rows([{ atSec: 0 }, { atSec: 6 }, { atSec: 15 }]);
    const segments = [
      { start: 1.4, end: 13.4 },
      { start: 13.4, end: 18.6 },
      { start: 18.6, end: 27.6 },
    ];
    // The real 14:09 meeting: row 2 was reached 6 s after row 1 but starts at 13.4 s of audio.
    expect(audioPosition(r, 1, { segments, firstUtteranceStart: 1.4 })).toBe(13.4);
    expect(audioPosition(r, 2, { segments, firstUtteranceStart: 1.4 })).toBe(18.6);
  });

  it("refuses the positional fallback when the counts disagree", () => {
    // An utterance was deleted without its boundary, so index N no longer means the same thing.
    // Better the old estimate than confidently seeking to another utterance's audio.
    const r = rows([{ atSec: 0 }, { atSec: 6 }]);
    const segments = [
      { start: 1.4, end: 13.4 },
      { start: 13.4, end: 18.6 },
      { start: 18.6, end: 27.6 },
    ];
    expect(audioPosition(r, 1, { segments, firstUtteranceStart: 1.4 })).toBe(1.4 + 6);
  });

  it("estimates from wall clock when there are no boundaries at all", () => {
    const r = rows([{ atSec: 0 }, { atSec: 20 }]);
    expect(audioPosition(r, 1, { firstUtteranceStart: 2 })).toBe(22);
    expect(audioPosition(r, 1, {})).toBe(20);
  });

  it("mixes sources per row: a stored offset wins even when neighbours lack one", () => {
    const r = rows([{ atSec: 0 }, { start: 13400, atSec: 6 }]);
    expect(audioPosition(r, 1, {})).toBe(13.4);
    expect(audioPosition(r, 0, {})).toBe(0);
  });

  it("returns null for a row that does not exist", () => {
    expect(audioPosition([], 0, {})).toBeNull();
    expect(audioPosition(rows([{ atSec: 0 }]), 5, {})).toBeNull();
  });

  it("never returns a negative position", () => {
    const r = rows([{ start: 5000, atSec: 10 }, { start: -1, atSec: 0 }]);
    expect(audioPosition(r, 1, {})).toBeGreaterThanOrEqual(0);
  });
});

describe("displayOffset", () => {
  it("counts from the first utterance, so the label starts at 0:00", () => {
    const r = rows([{ start: 1400, atSec: 0 }, { start: 13400, atSec: 6 }]);
    expect(displayOffset(r, 0, {})).toBe(0);
    expect(displayOffset(r, 1, {})).toBeCloseTo(12, 5);
  });

  it("agrees with where the click seeks", () => {
    // The label and the seek must come from the same number, or the player looks broken.
    const r = rows([{ atSec: 0 }, { atSec: 6 }]);
    const sources = {
      segments: [
        { start: 1.4, end: 13.4 },
        { start: 13.4, end: 18.6 },
      ],
      firstUtteranceStart: 1.4,
    };
    const seek = audioPosition(r, 1, sources)!;
    const label = displayOffset(r, 1, sources)!;
    expect(seek - label).toBeCloseTo(audioPosition(r, 0, sources)!, 5);
  });
});
