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
// Diarize used to sit in a toolbar at the top while the names it produces rendered below the
// status lines, and keeping those two together meant keeping every other block out from
// between them — an ordering nothing but this test held. They are one block now: asking for
// speakers and naming them are the same job, so they open and fold together.
//
// What is left in the row below is the work that changes nothing: take the transcript away,
// show the translations beside it, check it against the glossary. It sits under the two
// blocks that do rewrite it.

const root = join(__dirname, "..");
const list = readFileSync(join(root, "app/[id]/transcript-list.tsx"), "utf8");
const settings = readFileSync(join(root, "app/settings/page.tsx"), "utf8");

const at = (marker: string) => {
  const i = list.indexOf(marker);
  expect(i, `${marker} not found`).toBeGreaterThan(-1);
  return i;
};

describe("the transcript's blocks", () => {
  it("run from what changes the transcript to what only takes it away", () => {
    const speakers = at("{/* Speaker separation");
    const replace = at("{/* Find and replace");
    const retrans = at("{/* Re-transcription");
    const tools = at("{/* What to do with the transcript");
    expect(
      speakers < replace && replace < retrans && retrans < tools,
      "the blocks are no longer in the order the screen is meant to read in",
    ).toBe(true);
  });

  it("keeps Diarize and the names it produces in one block", () => {
    const block = list.slice(at("{/* Speaker separation"), at("{/* Find and replace"));
    // Both halves of the same job. Before, an ordering rule kept everything else out from
    // between them; now there is nowhere between them to get into.
    expect(block, "the Diarize button left the speaker block").toContain('{t("Diarize")}');
    expect(block, "the speaker names left the block Diarize is in").toContain("showSpeakerTools");
  });

  it("opens the speaker block by default", () => {
    // On a meeting that has just been recorded this is the next thing wanted, and a fold that
    // hides it is a fold nobody opens.
    expect(list).toMatch(/const \[diarOpen, setDiarOpen\] = useState\(true\)/);
    expect(list.slice(at("{/* Speaker separation"))).toMatch(/open=\{diarOpen\}/);
  });

  it("are headers rather than buttons somewhere else", () => {
    // Three <Disclosure> sections, each carrying its own title: speakers, replace, re-transcribe.
    expect(list.match(/<Disclosure\s/g)).toHaveLength(3);
  });

  it("puts sharing and the glossary check below what rewrites the transcript", () => {
    const tools = list.slice(at("{/* What to do with the transcript"));
    expect(tools).toContain("ShareButton");
    expect(tools).toContain("runSuggestions");
    expect(tools).toContain("Show translations");
  });
});

describe("Diarize", () => {
  // It reads the saved WAV exactly as Re-transcribe does, so once the recording has expired it
  // can only fail — the service answers 404. It used to stay on screen anyway, which is what
  // made the pair look inconsistent: one button vanished with the recording and one did not.
  it("goes when the recording goes", () => {
    expect(list, "Diarize is no longer gated on the recording still being there").toMatch(
      /const canDiarize =[\s\S]{0,120}recInfo\?\.exists \|\| diarizing/,
    );
    const block = list.slice(at("{/* Speaker separation"), at("{/* Find and replace"));
    const guard = block.indexOf("{canDiarize ? (");
    expect(guard, "the button is not behind that guard any more").toBeGreaterThan(-1);
    // Before the button, so it governs it. `diarizing` is in there to keep Stop reachable.
    expect(guard).toBeLessThan(block.indexOf('{t("Diarize")}'));
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
