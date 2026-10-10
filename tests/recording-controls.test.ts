import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The control a recording needs, since v4 on the meeting's own page (recording-dock.tsx).
//
// It was a full-width "Start recording" at the bottom of a page of its own, and starting folded
// the microphone check and the tips away above it: the page got shorter, the bar it sat in rode
// up with it, and the button left the place the pointer had just pressed. Now it is a round
// button in a dock fixed to the bottom of the window — a red dot to start, a red square to stop —
// the same size in the same place either way, with no word on it.
//
// The guards came with it, and a Start that no longer checks what it used to fails in a way
// nobody sees until two jobs are fighting.

const src = readFileSync(join(__dirname, "..", "app/[id]/recording-dock.tsx"), "utf8");

const row = src.indexOf('<Prop label={t("Recording")}>');
const dock = src.indexOf("{/* The dock:");
const button = src.indexOf("onClick={active ? stopRecording : startRecording}");

describe("the recording control", () => {
  it("is in a dock fixed to the bottom of the window", () => {
    for (const [name, at] of Object.entries({ row, dock, button })) {
      expect(at, `${name} not found`).toBeGreaterThan(-1);
    }
    expect(button).toBeGreaterThan(dock);
    const bar = src.slice(dock, src.indexOf("{toast ? (", dock));
    expect(bar).toContain('className="fixed bottom-4 left-1/2');
  });

  it("does not move or change size when it starts", () => {
    const bar = src.slice(dock, src.indexOf("{toast ? (", dock));
    // One size for both states, and fixed-width slots either side so nothing can push it.
    expect(bar.match(/flex h-16 w-16 shrink-0/g)).toHaveLength(1);
    expect(bar.match(/flex w-32 items-center/g)).toHaveLength(2);
    // A dot or a square, and the words only for those who cannot see them.
    expect(bar).toContain('aria-label={active ? t("Stop recording") : t("Start recording")}');
    expect(bar).not.toMatch(/>\s*\{active \? t\("Stop recording"\) : t\("Start recording"\)\}\s*</);
  });

  it("keeps the guards that are still guards", () => {
    const bar = src.slice(dock);
    // Refused from outside the tailnet, where the STT service cannot be reached at all, and
    // once the meeting has ended. Stopping is always allowed — that is what `&& !active` is for.
    expect(bar).toContain("disabled={(external && !active) || startBlocked}");
    expect(src).toContain("const startBlocked = ended;");
  });

  it("no longer waits for the GPU, because it can ask for it", () => {
    // The point of the interrupt: a recording happens when people are in a room talking, and
    // "the card is busy" is not an answer you can give them. It asks, and a person decides.
    expect(src).not.toMatch(/startBlocked = ended \|\| \(gpu\.busy/);
    expect(src).toContain("/api/queue/recording");
    // Both outcomes exist: take the card, or record without recognising as you go.
    expect(src).toContain("liveTranscript: live");
    expect(src).toContain("setRecordOnly(true)");
    expect(src).not.toContain("useGpuBusy");
  });

  it("reads the answer out of the dialog's result rather than the result itself", () => {
    // `confirm` resolves to { ok, checked }. Testing the object tests nothing — it is always
    // truthy — so "Record only" silently interrupted anyway. Caught in a browser, not here,
    // which is why it is written down.
    expect(src).toContain("const { ok: takeIt } = await confirm({");
    expect(src).not.toMatch(/const takeIt = await confirm\(/);
  });

  it("has the running time beside it, and the status in the meeting's details", () => {
    expect(src.slice(dock)).toContain("runningTime(elapsedSec)");
    const details = src.slice(row, dock);
    expect(details).toContain("statusText(t, status)");
    expect(details, "the clock is in both places").not.toContain("runningTime(elapsedSec)");
  });

  it("keeps the ways to end the meeting in one menu beside it", () => {
    const menu = src.slice(src.indexOf('label={t("End the meeting")}'));
    for (const what of ['setEndDialog("minutes")', 'setEndDialog("diarize")', "endOnly", "discardAndEnd"]) {
      expect(menu, what).toContain(what);
    }
  });
});

describe("the recording screen's address", () => {
  it("leads to the meeting page, carrying what it was asked", () => {
    const old = readFileSync(join(__dirname, "..", "app/[id]/recording/page.tsx"), "utf8");
    expect(old).toContain("redirect(`/${id}${qs ? `?${qs}` : \"\"}`)");
    expect(old).toContain("query.append(key, v)");
  });
});
