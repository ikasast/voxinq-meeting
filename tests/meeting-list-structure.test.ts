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

describe("the calendar over the list", () => {
  const cal = readFileSync(join(__dirname, "..", "app", "meeting-calendar.tsx"), "utf8");
  const form = readFileSync(join(__dirname, "..", "app", "new", "new-meeting-form.tsx"), "utf8");
  const newPage = readFileSync(join(__dirname, "..", "app", "new", "page.tsx"), "utf8");

  it("counts the month with its own query", () => {
    // The list takes 100 rows newest-first, which cannot answer "how many on the 3rd of March".
    // Counting from what the list happens to hold would draw an empty March.
    expect(src).toContain("startedAt: { gte: monthStart, lt: monthEnd }");
    expect(src).toContain("select: { startedAt: true }");
  });

  it("is hidden beside a search or a series, and kept beside a picked day", () => {
    // Both already answer "when" in their own terms; a third axis beside them only narrows to
    // nothing. A picked day is what the calendar is showing, so it stays.
    expect(src).toContain("const showCalendar = !query && !activeSeries;");
  });

  it("offers to add a meeting whether or not the day is empty", () => {
    // The correction to the original mock, which only offered it on empty days: a day that is
    // already busy is exactly when another one gets booked.
    const band = src.slice(src.indexOf("{activeDate ? ("));
    const add = band.indexOf("+ Add a meeting on this day");
    expect(add).toBeGreaterThan(0);
    expect(band.slice(0, add)).not.toContain("meetings.length === 0 ?");
  });

  it("keeps the picked day when the search form is submitted", () => {
    expect(src).toContain('<input type="hidden" name="date" value={activeDate} />');
  });

  it("carries the picked day into the new-meeting form", () => {
    expect(src).toContain("href={`/new?date=${activeDate}`}");
    expect(newPage).toContain("searchParams: Promise<{ date?: string }>");
    expect(form).toContain("`${date}T09:00`");
  });

  it("makes the selected day its own way out", () => {
    // Clicking the day already selected clears it, so the same cell is both directions.
    expect(cal).toContain("hrefForDay(isSelected ? null : cell.key)");
  });

  it("caps the dots at three", () => {
    expect(cal).toContain("Math.min(count, 3)");
  });

  it("names each day for a screen reader, including the empty ones", () => {
    expect(cal).toMatch(/aria-label=\{`\$\{cell\.key\}, \$\{count\} meeting/);
  });
});
