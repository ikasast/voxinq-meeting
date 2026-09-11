import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The bottom bar exists because the way to a recording had got long: the microphone was the
// smallest of five icons in the furthest corner of a phone's top bar, with no label. Each of
// these is a property that would fail quietly — a second record button, a control that only
// ever 403s, or a list whose last row sits under the bar.

const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");
const bar = read("app/bottom-bar.tsx");
const layout = read("app/layout.tsx");

describe("the record bar on a phone", () => {
  it("stays off the recording screen", () => {
    // That screen already has a full-width Start recording along the bottom. Two record buttons
    // on one screen, one of which abandons the meeting being recorded, is worse than neither.
    expect(bar).toContain(String.raw`/^\/[^/]+\/recording$/`);
    expect(bar).toContain(String.raw`/^\/quick-record$/`);
  });

  it("stays off the screens where nobody is identified yet", () => {
    // Offering to record on the login page promises what the next tap refuses. The list of
    // those screens is shared now — the header's New meeting needs the same one — so this
    // follows it there rather than pinning where it used to be written.
    expect(bar).toContain("isAuthPath(pathname)");
    const paths = read("app/auth-paths.ts");
    expect(paths).toContain(String.raw`/^\/login$/`);
    expect(paths).toContain(String.raw`/^\/setup$/`);
    expect(paths).toContain(String.raw`/^\/reset\//`);
  });

  it("is not offered to somebody who cannot record", () => {
    // Recording is refused server-side from outside the tailnet. A button that is only ever
    // going to fail is worse than its absence.
    expect(bar).toContain("if (external ||");
  });

  it("makes its own room, so nothing ends up underneath it", () => {
    // As a spacer in the flow rather than padding on `main`: the bar and the room it needs are
    // then one component and cannot drift apart when either changes.
    expect(bar).toContain('className="h-[76px] lg:hidden"');
  });

  it("says the word, not only the glyph", () => {
    // A microphone alone reads as "audio", not "start recording now" — and the whole point is
    // somebody who has not used this app before.
    expect(bar).toContain("Record now");
  });

  it("belongs to the narrow layout only", () => {
    // The rail does this job from `lg` up. Two of them at once would be the same navigation
    // twice on one screen.
    expect(bar).toContain("lg:hidden");
  });

  it("clears the phone's home indicator", () => {
    expect(bar).toContain("env(safe-area-inset-bottom)");
  });
});

describe("the top bar, once the bar below exists", () => {
  it("gives up the record and queue icons rather than showing them twice", () => {
    expect(layout).not.toContain("<QueueHeaderLink />");
    expect(layout).not.toContain('href="/quick-record"');
  });

  it("spends the room on saying what New makes", () => {
    // "+ New" never said new *what*, and it was abbreviated for space that the two departing
    // icons have now freed. Measured at 375px: "New meeting" fits without wrapping.
    // Through t() since the shell was translated, so this follows the sentence there rather
    // than pinning the literal it used to be.
    // It is its own small component now, so it can stay off the sign-in screens.
    expect(layout).toContain("<NewMeetingLink />");
    expect(read("app/new-meeting-link.tsx")).toMatch(/>\s*\{t\("New meeting"\)\}\s*<\/Link>/);
  });
});
