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

describe("the meeting at a glance", () => {
  // One bar per line flickered: the model labels most lines, so neighbouring bars changed colour
  // almost every line. It is a minute at a time now, coloured only where the minute stands out.
  const line = (i: number, at: number, feeling: "joy" | "anger" | "sadness" | null) => ({ id: `l${i}`, at, feeling });

  it("takes the lines a minute at a time, half a minute in a short meeting", async () => {
    const { bucketSeconds } = await import("@/app/[id]/mood-strip");
    expect(bucketSeconds(300)).toBe(30);
    expect(bucketSeconds(26 * 60)).toBe(60);
    // At most about sixty bars, however long the meeting.
    expect(bucketSeconds(3 * 3600)).toBe(180);
  });

  it("colours a minute only where one feeling is more of it than of the whole meeting", async () => {
    const { moodBuckets } = await import("@/app/[id]/mood-strip");
    const pts = [
      // Minute 0: mixed, as most of the meeting is.
      line(0, 5, "joy"), line(1, 20, "anger"), line(2, 30, "sadness"), line(3, 40, null),
      // Minute 1: anger, well above its share of the meeting.
      line(4, 62, "anger"), line(5, 70, "anger"), line(6, 80, "anger"), line(7, 90, null),
      // Minutes 2 to 9: quiet, so the meeting is long enough for one-minute bars.
      ...Array.from({ length: 16 }, (_, i) => line(8 + i, 120 + i * 40, null)),
    ];
    const b = moodBuckets(pts);
    expect(b[0].standout).toBeNull();
    expect(b[1].standout?.feeling).toBe("anger");
    expect(b[1].count).toBe(4);
    expect(b[1].firstId).toBe("l4");
  });

  it("leaves a minute with too few lines uncoloured", async () => {
    const { moodBuckets } = await import("@/app/[id]/mood-strip");
    const b = moodBuckets([line(0, 10, "joy"), line(1, 700, null)]);
    expect(b[0].standout).toBeNull();
  });
});
