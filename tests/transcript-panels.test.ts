import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Where the transcript's controls sit, and what they depend on.
//
// Find & replace and Re-transcribe were pills in the toolbar, and the panels they opened
// rendered several screens below it. On a phone, tapping one appeared to do nothing at all.
// They are their own rows now and open inside their own headers, so how far down the page
// they sit no longer separates a control from what it controls.
//
// What their position does decide is what ends up between Diarize and the speaker names it
// produces — which is why they sit below that card and not above it. Nothing but the order of
// blocks in one file holds that, and nothing else would notice it changing.

const root = join(__dirname, "..");
const list = readFileSync(join(root, "app/[id]/transcript-list.tsx"), "utf8");
const settings = readFileSync(join(root, "app/settings/page.tsx"), "utf8");

describe("the transcript's disclosures", () => {
  it("stay out from between Diarize and the names it produces", () => {
    const toolbar = list.indexOf("{/* Top toolbar");
    const speakers = list.indexOf("{/* Speaker names");
    const replace = list.indexOf("{/* Find and replace");
    const retrans = list.indexOf("{/* Re-transcription");
    for (const [name, at] of Object.entries({ toolbar, speakers, replace, retrans })) {
      expect(at, `${name} block not found`).toBeGreaterThan(-1);
    }
    expect(
      toolbar < speakers && speakers < replace && replace < retrans,
      "something is between the Diarize button and the speaker names, which are its result",
    ).toBe(true);
  });

  it("are headers rather than buttons somewhere else", () => {
    // The pills are gone: two <Disclosure> sections carry their own titles.
    expect(list).toMatch(/<Disclosure\s/);
    expect(list.match(/<Disclosure\s/g)).toHaveLength(2);
  });
});

describe("Diarize", () => {
  // It reads the saved WAV exactly as Re-transcribe does, so once the recording has expired it
  // can only fail — the service answers 404. It used to stay on screen anyway, which is what
  // made the pair look inconsistent: one button vanished with the recording and one did not.
  it("goes when the recording goes", () => {
    const toolbar = list.slice(
      list.indexOf("{/* Top toolbar"),
      list.indexOf("{/* Find and replace"),
    );
    expect(toolbar, "the Diarize button is not in the toolbar any more").toContain("Diarize");
    const guard = toolbar.indexOf("recInfo?.exists || diarizing");
    expect(
      guard,
      "Diarize is no longer gated on the recording still being there",
    ).toBeGreaterThan(-1);
    // Before the button, so it governs it. `diarizing` is in there to keep Stop reachable.
    expect(guard).toBeLessThan(toolbar.indexOf("Diarize"));
  });
});

describe("the remote-recognition warning", () => {
  // It is about the choice in the "Recognise speech" select. Above the card it read as being
  // about the page.
  it("is handed to the picker rather than rendered above it", () => {
    expect(settings).toMatch(/notice=\{sttDest \? <RemoteSttNotice host=\{sttDest\} \/> : null\}/);
    const heading = settings.indexOf("Transcription (Whisper)");
    const stray = settings.indexOf("<RemoteSttNotice", heading);
    const component = settings.indexOf("<SttProfiles", heading);
    expect(stray, "the notice is back outside the picker").toBeGreaterThan(component);
  });
});
