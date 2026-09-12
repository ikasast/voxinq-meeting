import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The rail, the phone's way round the app, ending a meeting, and a series made on its own.
// File-content checks, like the rest of the UI tests here: each is a thing that was asked for
// because it was missing, and would go missing again without anyone noticing.

const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

describe("the rail", () => {
  it("draws its icons at 26px and leaves the labels as they were", () => {
    const rail = read("app/side-rail.tsx");
    expect(rail).toContain("[&_svg]:h-[26px] [&_svg]:w-[26px]");
    expect(rail).toContain("text-[10px]");
  });

  it("uses a conversation for Meetings and a folder for Series", () => {
    const icons = read("app/icons.tsx");
    expect(icons).toContain("Tabler Icons");
    const series = icons.slice(icons.indexOf("export const SeriesIcon"));
    // The folder's first stroke, not the ↻ arc it replaced.
    expect(series.slice(0, 600)).toContain('d="M9 4h3l2 2h5');
  });

  it("no longer types ↻ for a series anywhere it names one", () => {
    for (const f of [
      "app/meeting-list-pane.tsx",
      "app/series/page.tsx",
      "app/series/[id]/page.tsx",
      "app/archive/page.tsx",
      "app/[id]/meeting-meta.tsx",
      "app/[id]/meeting-facts-card.tsx",
    ]) {
      expect(read(f), f).not.toContain("↻ {");
    }
  });
});

describe("on a phone", () => {
  it("reaches the series list from the bottom bar", () => {
    const bar = read("app/bottom-bar.tsx");
    expect(bar).toContain('href="/series"');
    // `/series` is shaped like a meeting's own page; without naming it, Meetings lit up too.
    expect(bar).toContain("!TOP_LEVEL.includes(pathname)");
  });

  it("reaches it from the header when there is no bottom bar", () => {
    const layout = read("app/layout.tsx");
    const header = layout.slice(layout.indexOf("function HeaderNav"), layout.indexOf("</header>"));
    expect(header).toMatch(/\{external \? \(\s*<Link\s+href="\/series"/);
  });

  it("can see the version, at the bottom of Settings", () => {
    expect(read("app/settings/layout.tsx")).toContain("Voxinq Meeting v{version}");
  });
});

describe("ending a meeting", () => {
  const page = read("app/[id]/recording/page.tsx");

  it("asks in the reader's language", () => {
    // The three end dialogs were the last English on the recording screen.
    for (const s of [
      "End the meeting without generating minutes.",
      "Start generating minutes and end the meeting.",
      "Protect the recording (otherwise",
    ]) {
      const at = page.indexOf(s);
      expect(at, s).toBeGreaterThan(-1);
      expect(page.slice(Math.max(0, at - 40), at), s).toContain("t(");
    }
    expect(page).not.toContain('confirmLabel: "End"');
    expect(page).not.toContain('title || "Meeting"');
  });

  it("can end without keeping it, into the trash rather than away", () => {
    const at = page.indexOf("const discardAndEnd");
    expect(at).toBeGreaterThan(-1);
    const body = page.slice(at, page.indexOf("}, [", at));
    expect(body).toContain('method: "DELETE"');
    // `?permanent=1` would take the recording with it and leave nothing to undo.
    expect(body).not.toContain("permanent=1");
    // Not transcribed on the way out: that spends the GPU on something being thrown away.
    expect(body).not.toContain("transcribeIfDeferred");
    expect(page).toContain("onClick={discardAndEnd}");
  });
});

describe("a series made on its own", () => {
  it("is kept with no meetings, while one a meeting named still goes with its last", () => {
    expect(read("lib/series.ts")).toContain("meetings: { none: {} }, standalone: false");
    expect(read("app/api/series/route.ts")).toContain("standalone: true");
  });

  it("is its owner's, including before anything is filed under it", () => {
    const p = read("lib/prisma.ts");
    // Owned outright now; see tests/audit-fixes.test.ts.
    expect(p).toMatch(/const OWNED = new Set\(\[[^\]]*"series"/);
    // Its members follow the series.
    expect(p).toContain("if (VIA_SERIES.has(model)) return { series: { ownerId: userId } };");
  });

  it("is shown in the list though it has no meetings yet", () => {
    expect(read("app/series/page.tsx")).toContain("s._count.meetings > 0 || s.standalone");
  });

  it("can be deleted only while nothing is filed under it, trashed meetings included", () => {
    const r = read("app/api/series/[id]/route.ts");
    const del = r.slice(r.indexOf("export async function DELETE"));
    // `_count` is not narrowed by the scoped client, so it counts everybody's meetings.
    expect(del).toContain("_count: { select: { meetings: true } }");
    expect(del).toContain("409");
  });

  it("opens straight into its editor", () => {
    expect(read("app/series/new-series-button.tsx")).toContain("router.push(`/series/${d.id}?edit=1`)");
    expect(read("app/series/[id]/page.tsx")).toContain('startEditing={edit === "1"}');
  });
});
