import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// How far the minutes are from the top of the page.
//
// The meeting's own details are a rail beside the minutes at 2xl and wider. Below that there is
// no room for a rail, so they stack — and stacked, four cards sit between the top of the page
// and the thing somebody opened the meeting to read. On a 375px phone that put the Minutes
// heading 1091px down: a screen and a half of scrolling past context, every time.
//
// Closed, it is 372px. The bar keeps the three numbers worth having at a glance.

const root = join(__dirname, "..");
const aside = readFileSync(join(root, "app/[id]/meeting-aside.tsx"), "utf8");
const page = readFileSync(join(root, "app/[id]/page.tsx"), "utf8");

// The component's own comment says why it does not use `matchMedia`, so the assertion below
// has to read the code rather than the prose about it.
const asideCode = aside.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*/g, "");

describe("the meeting's details column", () => {
  it("is opened by CSS on a wide screen, not by measuring the window", () => {
    // The page is server-rendered. A component that waits for `matchMedia` before deciding
    // renders the wrong thing first and then jumps, which is worse than what it fixes — so the
    // wide case has to need no JavaScript at all.
    expect(aside).toMatch(/hidden.*2xl:block|2xl:block.*hidden/);
    expect(asideCode).not.toContain("matchMedia");
    expect(asideCode).not.toContain("useEffect");
  });

  it("hides its own button where the rail is showing", () => {
    // Otherwise the wide layout grows a control that collapses a column already beside the
    // minutes, which is not the problem it exists for.
    expect(aside).toContain("2xl:hidden");
  });

  it("says what it is holding while it is closed", () => {
    // Closing something is easier to accept when what it held is still readable — so the
    // summary wraps rather than being cut off. Measured at 375px: the English label plus
    // "22 min · 14 utterances · 3 people" needs 185px and has 184, so it is already at the
    // edge, and "1 hr 22 min · 140 utterances · 12 people" loses 25px of itself to `truncate`.
    expect(aside).toContain("{summary}");
    expect(aside).not.toContain("truncate");
    expect(aside).toContain("flex-wrap");
  });

  it("is built from the numbers the page already has", () => {
    expect(page).toContain("const asideSummary = [");
    expect(page).toContain("formatDurationIn(locale, meeting.recordedMs)");
    expect(page).toMatch(/"1 utterance" : "\{n\} utterances"/);
    expect(page).toMatch(/"1 person" : "\{n\} people"/);
  });

  it("still wraps every card that was in the rail", () => {
    // The point is where they are, not whether they are there.
    const open = page.indexOf("<MeetingAside");
    const close = page.indexOf("</MeetingAside>");
    expect(open).toBeGreaterThan(-1);
    const inside = page.slice(open, close);
    for (const card of ["<ProgressCard", "<MeetingMeta", "<ParticipantsCard", "<MeetingFactsCard"]) {
      expect(inside).toContain(card);
    }
  });
});
