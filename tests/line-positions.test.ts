import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// A line's time is where it is in the recording (audioStartMs), not when its row was saved. The
// saved-at stamp counts the minutes recording was stopped for, and a diarization that splits a
// line saves the pieces at the moment it ran — so on a meeting that was stopped and resumed, the
// times and the mood strip drifted from the words by however long it was stopped. The page did
// not pass the position on, so every time on it fell back to the stamp until something reloaded
// the lines from /live.

const read = (p: string) => readFileSync(join(__dirname, "..", p), "utf8");

describe("a line's position in the recording", () => {
  it("reaches the page on its first load", () => {
    expect(read("app/[id]/page.tsx")).toContain("audioStartMs: line.audioStartMs");
  });

  it("comes back with the lines when they are reloaded, with the way back from a split", () => {
    const live = read("app/api/meetings/[id]/live/route.ts");
    expect(live).toContain("audioStartMs: true");
    expect(live).toContain("splitOfId: true");
  });

  it("gives a review the page's times, not times from the first word", () => {
    const review = read("lib/queue/runners/review.ts");
    expect(review).toContain("formatOffset(l.startSec)");
    expect(review).not.toContain("firstMs");
  });

  it("keeps the player in sight while the lines scroll, under the phone's tabs", () => {
    const list = read("app/[id]/transcript-list.tsx");
    expect(list).toContain("sticky top-[calc(3.5rem+var(--phone-tabs-h,0px))]");
    expect(read("app/[id]/meeting-body.tsx")).toContain('root.style.setProperty("--phone-tabs-h"');
  });

  it("gives the exported transcript the page's times", () => {
    const route = read("app/api/meetings/[id]/export/route.ts");
    expect(route).toContain("displayOffset(rows, i, {})");
    expect(route).not.toMatch(/createdAt\.getTime\(\) - anchor/);
  });
});
