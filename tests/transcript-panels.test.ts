import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Where the transcript's controls sit, and what they depend on.
//
// Fixing the wording (once Find & replace) and Re-transcribe were once pills in a toolbar whose panels rendered several
// screens below it; on a phone, tapping one appeared to do nothing. Then they became folding
// rows, each a box with its own header — which, inside the transcript's own card and above lines
// that were boxes too, made the panel read as cards inside cards.
//
// Now (v4) they are icons beside the heading, and the one that is pressed opens its panel right
// under it: a fold between two rules, never another box. Asking for speakers and naming them
// are one job, so Diarize and the names it produces share a panel, and finding a misheard word
// by hand or by the glossary are one job, so they share one too. The work that changes nothing —
// take the transcript away, show the translations, measure it — waits behind "…".

const root = join(__dirname, "..");
const list = readFileSync(join(root, "app/[id]/transcript-list.tsx"), "utf8");
const settings = readFileSync(join(root, "app/settings/page.tsx"), "utf8");

const at = (marker: string) => {
  const i = list.indexOf(marker);
  expect(i, `${marker} not found`).toBeGreaterThan(-1);
  return i;
};

describe("the transcript's tools", () => {
  it("open under the heading, above the recording and the lines", () => {
    const button = at('toolButton("speakers"');
    const speakers = at("{/* Speaker separation");
    const replace = at("{/* Fixing the wording");
    const retrans = at("{/* Re-transcription");
    const player = at("<audio");
    const lines = at("<TranscriptRow");
    expect(
      button < speakers && speakers < replace && replace < retrans && retrans < player && player < lines,
      "a panel no longer opens where the button that opens it is",
    ).toBe(true);
  });

  it("open one at a time, and none to begin with", () => {
    // Three folds, each open or shut on its own, were most of what made the panel busy; a
    // speaker fold open by default was always the first thing on the page.
    expect(list).toMatch(/const \[tool, setTool\] = useState<Tool>\(null\)/);
    for (const k of ["speakers", "fix", "retrans"]) {
      expect(list).toContain(`{tool === "${k}" && `);
    }
  });

  it("are folds rather than boxes inside the card", () => {
    expect(list.match(/<ToolPanel\s/g)).toHaveLength(3);
    expect(list).not.toContain("<Disclosure");
    const panel = list.slice(at("function ToolPanel("));
    expect(panel.slice(0, panel.indexOf("\n}\n"))).not.toMatch(/rounded-lg border|bg-\[var\(--elevated\)\]/);
  });

  it("keeps separating and naming in one panel, as three steps", () => {
    const block = list.slice(at("{/* Speaker separation"), at("{/* Fixing the wording"));
    expect(block, "the run left the speaker panel").toContain('t("Separate speakers")');
    expect(block, "the speaker names left the panel the run is in").toContain("<SpeakerNamesEditor");
    expect(block.match(/<Step n=\{\d\}/g)).toHaveLength(3);
  });

  it("keep both ways of finding a misheard word in one panel, ending in one list", () => {
    const fix = readFileSync(join(root, "app/[id]/spelling-fix.tsx"), "utf8");
    expect(list).toContain('toolButton("fix"');
    expect(list).toContain("<SpellingFix");
    expect(list).not.toContain("runSuggestions");
    expect(fix).toContain("/replace`");
    expect(fix).toContain("/suggest-corrections`");
    // Whichever found them, the lines are ticked in one list and fixed by one button.
    expect(fix.match(/<ul /g)).toHaveLength(1);
    expect(fix).toContain("ids: picked.map((c) => c.id)");
  });

  it("put sharing, the checks and the translations behind the menu in the heading", () => {
    const menu = list.slice(at("{/* What to do with the transcript"), at("{/* Speaker separation"));
    expect(menu).toContain("<DropMenu");
    // Saving it as a file is in the meeting's download menu, with every other file.
    for (const what of ["shareText", "runVoiceCues", "runEmotion", "Show translations"]) {
      expect(menu, `${what} left the menu`).toContain(what);
    }
  });
});

describe("a line", () => {
  const row = list.slice(at("function TranscriptRow("), at("function ToolPanel("));

  it("names its speaker once, in colour, with no tag around it", () => {
    // The name was a coloured chip, and a picker beside it said the name again.
    expect(row).toContain("<SpeakerName");
    expect(row).not.toContain("SpeakerPicker");
    expect(row).not.toContain("SpeakerChip");
    expect(list).toContain("sameSpeaker={i > 0 && transcripts[i - 1].speakerType === line.speakerType}");
  });

  it("can still be given to someone else when its name is left out", () => {
    expect(row).toMatch(/canReassign && sameSpeaker \? \(\s*<SpeakerMenu/);
  });

  it("is not a box", () => {
    const li = row.slice(row.indexOf("<li"), row.indexOf(">", row.indexOf("<li")));
    expect(li).not.toMatch(/\bborder\b|bg-\[var\(--elevated\)\]/);
  });
});

describe("Diarize", () => {
  // It reads the saved WAV exactly as Re-transcribe does, so once the recording has expired it
  // can only fail — the service answers 404. It used to stay on screen anyway, which is what
  // made the pair look inconsistent: one button vanished with the recording and one did not.
  it("goes when the recording goes", () => {
    const block = list.slice(at("{/* Speaker separation"), at("{/* Fixing the wording"));
    const guard = block.indexOf("{recInfo && !recInfo.exists && !diarizing ? (");
    expect(guard, "the button is not behind that guard any more").toBeGreaterThan(-1);
    // Before the button, so it governs it. `diarizing` is in there to keep Stop reachable.
    expect(guard).toBeLessThan(block.indexOf('t("Separate speakers")'));
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
