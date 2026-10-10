import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The top of a meeting's page (v4, design B).
//
// It was a title with a box of outlined buttons, a "Meeting details" bar that opened onto four
// cards inside a card, and the minutes in a card of their own under a heading and five more
// outlined buttons. Now the meeting's details are a table under the title — a muted label and a
// value per row, with no box around any of it — and the minutes follow under a rule, as the
// document they are.

const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");
const page = read("app/[id]/page.tsx");
const at = (src: string, marker: string) => {
  const i = src.indexOf(marker);
  expect(i, `${marker} not found`).toBeGreaterThan(-1);
  return i;
};

describe("the meeting's details", () => {
  it("are a table under the title, in the order they are read", () => {
    const table = at(page, "<div className={PROPS_GRID}>");
    const rows = ['<Prop label={t("When")}>', "<ParticipantsRow", "<MeetingMeta", "<MeetingFacts"].map((m) =>
      at(page, m),
    );
    expect(at(page, "<MeetingTitle")).toBeLessThan(table);
    expect(rows.every((r, i) => r > table && (i === 0 || r > rows[i - 1]))).toBe(true);
  });

  it("are rows, not cards", () => {
    for (const f of ["app/[id]/participants-card.tsx", "app/[id]/meeting-meta.tsx", "app/[id]/meeting-facts-card.tsx"]) {
      const src = read(f);
      expect(src, f).not.toMatch(/className="card\b/);
      expect(src, f).not.toContain("rounded-lg border");
    }
  });

  it("fold away what they were made with", () => {
    // The model, the language and the glossary answer a question asked rarely.
    expect(read("app/[id]/meeting-facts-card.tsx")).toContain("<details");
  });

  it("say what is under way only while it is", () => {
    // Done, progress is what the rest of the page already shows.
    const row = at(page, '<Prop label={t("Status")}>');
    expect(page.slice(row - 80, row)).toContain("{transcribing || minutesRunning ? (");
  });
});

describe("the page's controls", () => {
  it("keep what is done to the whole meeting behind one menu", () => {
    expect(page).toContain("<MeetingMenu");
    for (const gone of ["<ArchiveButton", "<DeleteMeetingButton", "<CloneMeetingButton"]) {
      expect(page).not.toContain(gone);
    }
  });

  it("put the minutes on the page rather than in a card", () => {
    const section = page.slice(page.lastIndexOf("<section", at(page, "<SummarySection")));
    expect(section.startsWith("<section>")).toBe(true);
  });

  it("leave copying in sight beside the minutes and the transcript", () => {
    // It is what is done with either most; it is never one of the things behind "…".
    expect(read("app/[id]/summary-section.tsx")).toContain("<CopyButton");
    const list = read("app/[id]/transcript-list.tsx");
    expect(at(list, "<CopyButton")).toBeLessThan(at(list, "<DropMenu"));
  });

  it("keep every file the meeting can be saved as in one menu by the title", () => {
    const menu = read("app/[id]/download-meeting-button.tsx");
    for (const what of ['file("minutes")', "format=docx", "/print", 'file("transcript")', 'file("meta")', "saveRecording", 'row("zip"']) {
      expect(menu, what).toContain(what);
    }
    // And nowhere else.
    expect(read("app/[id]/summary-section.tsx")).not.toContain("format=docx");
    expect(read("app/[id]/transcript-list.tsx")).not.toContain("downloadText");
  });
});
