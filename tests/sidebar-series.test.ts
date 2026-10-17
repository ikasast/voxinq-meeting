import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The sidebar lists each series as one row that opens to its latest meetings (mockup A), and
// the days below hold the one-off meetings.

const read = (p: string) => readFileSync(join(__dirname, "..", p), "utf8");

describe("series in the sidebar", () => {
  const sidebar = read("app/sidebar.tsx");
  const data = read("app/sidebar-meetings.ts");

  it("keep a series' meetings out of the days, but not the pinned or booked ones", () => {
    expect(sidebar).toContain("if (m.seriesId && !m.pinned && !m.upcoming) continue;");
  });

  it("list only while Series is on, the most recent first", () => {
    expect(data).toContain('if (!(await extensionEnabled("series"))) return [];');
    expect(data).toContain(".sort((a, b) => b.lastAt.localeCompare(a.lastAt))");
    expect(data).toContain("seriesId: seriesOn ? m.seriesId : null");
  });

  it("open to three meetings and a link to the rest, and open where you are until folded", () => {
    expect(sidebar).toContain(".slice(0, 3)");
    expect(sidebar).toContain('t("All {n} meetings →", { n: s.count })');
    // A choice made by hand wins both ways; without one, the series holding the page is open.
    expect(sidebar).toContain("seriesChoice[s.id] ?? activeSeries === s.id");
    expect(sidebar).toContain("[id]: !open");
  });

  it("list seven, with a way to the rest", () => {
    expect(sidebar).toContain("const SIDEBAR_SERIES = 7;");
    expect(sidebar).toContain("series.slice(0, SIDEBAR_SERIES)");
    expect(sidebar).toContain('t("All series →")');
  });
});
