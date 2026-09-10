import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { demoMeeting } from "../lib/demo-meeting";
import { correctionTerms } from "../lib/correction-terms";
import { parseGlossaryTerms } from "../lib/llm/correct";

// The meeting somebody learns on, and the card that says what to press.
//
// The list on that card makes claims about the screen. Each one is checkable here, because a
// tutorial that names a button which is not there is worse than no tutorial — it teaches
// somebody that they have misunderstood the app.

const root = join(__dirname, "..");
const route = readFileSync(join(root, "app/api/meetings/sample/route.ts"), "utf8");
const guide = readFileSync(join(root, "app/[id]/first-run-guide.tsx"), "utf8");
const page = readFileSync(join(root, "app/[id]/page.tsx"), "utf8");

describe("the sample meeting", () => {
  it("arrives with no minutes, so pressing Generate actually generates", () => {
    // A sample that came with minutes already written would demonstrate nothing about the one
    // step people most want to see happen.
    expect(route).not.toContain("summaries:");
    expect(route).toContain("Deliberately no summary");
  });

  it("arrives with speakers already separated", () => {
    // Which is what diarization *produces* — and renaming them is the part somebody does.
    // Without distinct `speakerType`s the speaker-name panel does not render at all.
    for (const locale of ["ja", "en"] as const) {
      const speakers = new Set(demoMeeting(locale).lines.map((l) => l.speaker));
      expect(speakers.size, `${locale} needs more than one speaker`).toBeGreaterThan(1);
      expect(Object.keys(demoMeeting(locale).labels).sort()).toEqual([...speakers].sort());
    }
  });

  it("contains the mishearings its own glossary would catch", () => {
    // Step 2 of the card promises the correction pass has something to find. It only does if
    // the transcript actually spells a glossary term the way speech recognition gets it wrong.
    for (const locale of ["ja", "en"] as const) {
      const demo = demoMeeting(locale);
      const text = demo.lines.map((l) => l.text).join("\n");
      const terms = parseGlossaryTerms(demo.glossary);
      expect(terms.length, `${locale} sample has no terms`).toBeGreaterThan(1);
      // The correct spellings must be absent and something near them present — otherwise there
      // is nothing to correct, or nothing was ever wrong.
      for (const term of terms) {
        expect(text.includes(term), `${locale}: "${term}" is already spelled correctly`).toBe(
          false,
        );
      }
    }
  });

  it("is short enough that the first thing anybody waits for is short", () => {
    // Twelve lines through a 7B model is seconds. A real meeting on this instance averages
    // 23,000 tokens and is condensed first, which is minutes.
    for (const locale of ["ja", "en"] as const) {
      const demo = demoMeeting(locale);
      expect(demo.lines.length).toBeLessThanOrEqual(16);
      expect(demo.lines.map((l) => l.text).join("").length).toBeLessThan(2000);
    }
  });

  it("is one at a time, and removable exactly", () => {
    expect(route).toContain("MAX_SAMPLES");
    // By the column, so removing the samples cannot take a real meeting with it.
    expect(route).toContain("deleteMany({ where: { sample: true } })");
  });

  it("cannot be created from outside the private network", () => {
    // Writing rows is not on the external allow-list, and a sample is the least urgent reason
    // to be the exception.
    const handlers = route
      .split("export async function")
      .filter((s) => /^\s*(POST|DELETE)\b/.test(s));
    expect(handlers).toHaveLength(2);
    for (const fn of handlers) expect(fn).toContain("isExternalRequest()");
  });
});

describe("the card's claims about the screen", () => {
  it("only appears on a sample, and only from inside", () => {
    expect(page).toContain("meeting.sample && !external ?");
  });

  it("does not promise recording or diarization, and says why", () => {
    // Both need the audio, and a sample meeting has none — the real STT service answers
    // `{"exists": false}` for a meeting it holds no recording for, so the Diarize button does
    // not render at all. Naming it on the card would send somebody looking for nothing.
    const list = guide.slice(guide.indexOf("const steps"), guide.indexOf("return ("));
    expect(list).not.toContain("Diarize");
    expect(list).not.toContain("Start recording");
    expect(guide).toContain("both need the audio, and a sample meeting has none");
  });

  it("names the microphone check, which is the costly thing to skip", () => {
    // The one failure this app cannot undo is a meeting nobody recorded.
    expect(guide).toContain("check the microphone first");
  });

  it("is a list, not an overlay tour", () => {
    // An overlay has to know where every control is — a second description of the interface
    // that goes stale the first time one moves, silently. A numbered list naming the buttons
    // costs nothing to keep true.
    expect(guide).not.toMatch(/getBoundingClientRect|querySelector|position: *['"]absolute/);
    expect(guide).toContain("<ol");
  });
});

describe("the sample teaches the corrections button it names", () => {
  it("has terms of its own, so the button is not merely visible but useful", () => {
    // The button is always offered now, but the sample should have something for it to find
    // rather than teaching somebody what an empty result looks like.
    const demo = demoMeeting("ja");
    expect(correctionTerms({ globalGlossary: demo.glossary, series: null }).length).toBeGreaterThan(
      1,
    );
  });
});
