import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Structure of the meeting list. These are file-content checks because the pane is an async
// server component that queries Prisma — there is no cheap way to render it here — and because
// each of them is a thing that was actually wrong and would be silently wrong again.

const src = readFileSync(join(__dirname, "..", "app", "meeting-list-pane.tsx"), "utf8");

describe("the meeting list", () => {
  it("lists a series' meetings individually", () => {
    // A weekly meeting is a meeting. Folding four of them behind a disclosure meant the list
    // was not the list, and the newest of them hid the other three.
    expect(src).not.toContain("SeriesStack");
    expect(src).not.toContain("series-stack");
  });

  it("closes the meeting link before the badges, so the series chip can be one", () => {
    // A link inside a link is invalid HTML, and browsers resolve it by dropping the inner one —
    // which would make the chip look clickable and do nothing.
    const linkClose = src.indexOf("</Link>");
    const badges = src.indexOf("data-rec-badge");
    expect(linkClose).toBeGreaterThan(0);
    expect(badges).toBeGreaterThan(linkClose);
  });

  it("makes the series chip filter the list", () => {
    expect(src).toContain("href={hrefWith({ series: m.seriesName })}");
  });

  it("hides the chip on the series it is already showing", () => {
    expect(src).toContain('m.seriesName !== activeSeries');
  });

  it("puts Archived and Trash above the list, not below it", () => {
    // They used to sit under every card. Scrolling past everything to reach what you put away
    // is the one thing you are not doing when you are looking for it.
    const archive = src.indexOf('href="/archive"');
    const list = src.indexOf("<ul className=");
    expect(archive).toBeGreaterThan(0);
    expect(archive).toBeLessThan(list);
  });

  it("keeps the series filter when the search form is submitted", () => {
    // The form GETs its own fields; anything not in it is dropped from the URL.
    expect(src).toContain('<input type="hidden" name="series" value={activeSeries} />');
  });

  it("bands past meetings by when they happened, not when the row was made", () => {
    expect(src).toContain("b.startedAt.getTime() - a.startedAt.getTime()");
    expect(src).toContain("bandOf(m.startedAt, now)");
  });
});
