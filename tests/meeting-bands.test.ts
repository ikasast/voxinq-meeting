import { describe, expect, it } from "vitest";
import { bandOf } from "../lib/meeting-bands";

// The dividers in the meeting list. Off-by-one here is not cosmetic: a meeting that happened
// six days ago appearing under "Over a week ago" is the list telling you something false.

const now = Date.parse("2026-09-05T12:00:00Z");
const ago = (ms: number) => new Date(now - ms);
const DAY = 24 * 60 * 60 * 1000;

describe("which band a meeting falls in", () => {
  it("calls the last seven days this week", () => {
    expect(bandOf(ago(0), now)).toBe("This week");
    expect(bandOf(ago(6 * DAY), now)).toBe("This week");
    expect(bandOf(ago(7 * DAY - 1), now)).toBe("This week");
  });

  it("moves over at exactly a week, not a day either side of it", () => {
    expect(bandOf(ago(7 * DAY), now)).toBe("Over a week ago");
    expect(bandOf(ago(29 * DAY), now)).toBe("Over a week ago");
  });

  it("moves over again at exactly thirty days", () => {
    expect(bandOf(ago(30 * DAY - 1), now)).toBe("Over a week ago");
    expect(bandOf(ago(30 * DAY), now)).toBe("Over a month ago");
    expect(bandOf(ago(400 * DAY), now)).toBe("Over a month ago");
  });

  it("treats a start in the future as now", () => {
    // A recording that has only just begun can have a start a second ahead of the server's
    // clock. Banding it by a negative age would put it under "Over a month ago".
    expect(bandOf(new Date(now + 5000), now)).toBe("This week");
  });
});
