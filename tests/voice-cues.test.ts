import { describe, expect, it } from "vitest";
import { type CueLine, marks, readCues, relativeCues, spokenLength } from "@/lib/voice-cues";

// Voice cues: each line against the same speaker's own lines in the same meeting.

const line = (id: string, speaker: string, rmsDb: number, f0: number | null, voicedS = 2, text = "あいうえおかきくけこ"): CueLine => ({
  id,
  speaker,
  text,
  measured: { rmsDb, f0, voicedS },
});

describe("against the speaker's own average", () => {
  it("marks the one line said louder and higher than the rest", () => {
    const cues = relativeCues([
      line("a", "self", -30, 120),
      line("b", "self", -30, 121),
      line("c", "self", -31, 119),
      line("d", "self", -20, 160),
    ]);
    expect(marks(cues.get("d")!)).toEqual([
      { cue: "loud", up: true },
      { cue: "pitch", up: true },
    ]);
    expect(marks(cues.get("a")!)).toEqual([]);
  });

  it("does not call a quiet speaker quiet: each is compared with themselves", () => {
    const far = ["a", "b", "c", "d"].map((id) => line(`far-${id}`, "partner-0", -45, 200));
    const near = ["a", "b", "c", "d"].map((id) => line(`near-${id}`, "self", -15, 110));
    const cues = relativeCues([...far, ...near]);
    for (const c of cues.values()) expect(marks(c)).toEqual([]);
  });

  it("judges nobody with too few lines to have a usual", () => {
    const cues = relativeCues([line("a", "self", -30, 120), line("b", "self", -10, 200), line("c", "self", -30, 120)]);
    for (const c of cues.values()) expect(c).toEqual({});
  });

  it("measures pace from what was said over how long the voice ran", () => {
    const text = "あ".repeat(20);
    const cues = relativeCues([
      line("a", "self", -30, 120, 4, text),
      line("b", "self", -30, 120, 4, text),
      line("c", "self", -30, 120, 4, text),
      line("d", "self", -30, 120, 2, text), // the same words in half the time
    ]);
    expect(marks(cues.get("d")!)).toEqual([{ cue: "pace", up: true }]);
  });

  it("leaves out a line with nothing measured, and a cue with nothing to measure", () => {
    const cues = relativeCues([
      { id: "x", speaker: "self", text: "", measured: null },
      ...["a", "b", "c", "d"].map((id) => line(id, "self", -30, null)),
    ]);
    expect(cues.has("x")).toBe(false);
    expect(cues.get("a")!.pitch).toBeUndefined();
  });
});

describe("the stored cues", () => {
  it("read back what was written, and nothing from what was not", () => {
    expect(readCues('{"loud":1.4,"pace":-0.2}')).toEqual({ loud: 1.4, pace: -0.2 });
    expect(readCues("not json")).toBeNull();
    expect(readCues(null)).toBeNull();
  });

  it("count spoken characters, not spaces or punctuation", () => {
    expect(spokenLength("はい、そうです。 OK!")).toBe(8);
  });
});
