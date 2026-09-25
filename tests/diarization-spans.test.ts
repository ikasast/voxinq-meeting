import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { spansForDiarization } from "@/lib/meetings/apply";

// Which lines the diarizer is asked about, and how its answer gets back onto them.
//
// It used to be by position: the Nth boundary the STT service saved was the Nth row here. One
// row deleted, or a re-recognition that found a different number of utterances, moved every
// later speaker onto the wrong line — and nothing about a transcript looks broken when the
// speakers are simply all shifted by one. Rows carry their own place in the recording, so the
// question and the answer can both be about the same lines.

describe("the spans a diarizer is asked about", () => {
  it("are the rows' own places in the recording, in seconds", () => {
    expect(
      spansForDiarization([
        { id: "a", audioStartMs: 0, audioEndMs: 2400 },
        { id: "b", audioStartMs: 61_500, audioEndMs: 66_200 },
      ]),
    ).toEqual([
      { start: 0, end: 2.4 },
      { start: 61.5, end: 66.2 },
    ]);
  });

  it("are refused outright when one row does not know where it is", () => {
    // Asking about the rows that do know would answer about a different set of lines than the
    // caller believes, which is the failure this whole change exists to remove.
    expect(
      spansForDiarization([
        { id: "a", audioStartMs: 0, audioEndMs: 2400 },
        { id: "b", audioStartMs: null, audioEndMs: null },
      ]),
    ).toBeNull();
    expect(spansForDiarization([{ id: "a", audioStartMs: 1000, audioEndMs: null }])).toBeNull();
  });

  it("are refused for a span that cannot be a span", () => {
    expect(spansForDiarization([{ id: "a", audioStartMs: 500, audioEndMs: 500 }])).toBeNull();
    expect(spansForDiarization([{ id: "a", audioStartMs: 900, audioEndMs: 500 }])).toBeNull();
    expect(spansForDiarization([{ id: "a", audioStartMs: -1, audioEndMs: 500 }])).toBeNull();
  });

  it("are nothing at all for a meeting with no rows", () => {
    expect(spansForDiarization([])).toBeNull();
  });
});

describe("the diarize job", () => {
  const src = readFileSync(join(__dirname, "..", "lib/queue/runners/diarize.ts"), "utf8");

  it("asks about the rows it has, and puts the answer back on those rows", () => {
    expect(src).toContain("spansForDiarization(rows)");
    expect(src).toContain("spans ? { utterances: spans } : undefined");
    expect(src).toContain("applySpeakersToRows(");
  });

  it("still answers by position for a recording whose rows have no offsets", () => {
    // Every meeting recorded before offsets were kept, which must not lose diarization.
    expect(src).toContain("await applySpeakers(meetingId, labels)");
  });
});
