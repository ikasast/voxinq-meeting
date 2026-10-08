import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { emotionMark, readEmotion } from "@/lib/emotion";

// Emotion: what a line sounded like, shown only where it was clear.

describe("a line's emotion", () => {
  it("is labelled when joy, anger or sadness is clearly ahead", () => {
    expect(emotionMark([0.4, 0.0, 0.6, 0.0])).toEqual({ emotion: "anger", p: 0.6 });
    expect(emotionMark([0.05, 0.0, 0.07, 0.88])).toEqual({ emotion: "sadness", p: 0.88 });
  });

  it("is not labelled for neutral, or for a close call", () => {
    expect(emotionMark([0.82, 0.03, 0.11, 0.04])).toBeNull();
    expect(emotionMark([0.3, 0.01, 0.22, 0.47])).toBeNull(); // sadness ahead, but under half
  });

  it("reads back only what was written whole", () => {
    expect(readEmotion('{"probs":[0.1,0.2,0.3,0.4]}')).toEqual([0.1, 0.2, 0.3, 0.4]);
    expect(readEmotion('{"probs":[0.1,0.2]}')).toBeNull();
    expect(readEmotion("nope")).toBeNull();
    expect(readEmotion(null)).toBeNull();
  });
});

describe("the job", () => {
  it("gives way to a recording, and can be stopped, like diarization", async () => {
    const root = join(__dirname, "..");
    expect(await readFile(join(root, "lib/queue/recording.ts"), "utf8")).toContain(
      'if (c.kind === "emotion" && c.meetingId) await cancelEmotion(c.meetingId);',
    );
    expect(await readFile(join(root, "app/api/jobs/[id]/cancel/route.ts"), "utf8")).toContain(
      'if (job.kind === "emotion" && job.meetingId) await cancelEmotion(job.meetingId);',
    );
  });
});
