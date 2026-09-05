import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Start and Stop live at the bottom of the recording screen.
//
// They were at the top, which on a phone is the far corner from your thumb — and Stop is the
// one control you may need in a hurry, in the middle of a meeting, one-handed. The end actions
// were the coloured ones down there; they are the quiet ones now, above it. That is the right
// way round: you press them once, at the end.
//
// The move carried a real risk worth guarding, because it was a move rather than a rewrite:
// the button's guards travelled with it or they did not, and a Start that no longer checks
// whether the GPU is busy fails in a way nobody sees until two jobs are fighting.

const src = readFileSync(join(__dirname, "..", "app/[id]/recording/page.tsx"), "utf8");

const topBar = src.indexOf("{/* Sticky top bar");
const bottomBar = src.indexOf("{/* Sticky bottom bar");
const control = src.indexOf('{active ? "Stop recording" : "Start recording"}');

describe("the recording control", () => {
  it("is in the bottom bar", () => {
    for (const [name, at] of Object.entries({ topBar, bottomBar, control })) {
      expect(at, `${name} not found`).toBeGreaterThan(-1);
    }
    expect(control, "Start/Stop is back above the page instead of under the thumb").toBeGreaterThan(
      bottomBar,
    );
  });

  it("keeps the guards that are still guards", () => {
    const bar = src.slice(bottomBar);
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
    // And it stopped watching the busy flag, which now has nothing on this screen to decide.
    expect(src).not.toContain("useGpuBusy");
  });

  it("reads the answer out of the dialog's result rather than the result itself", () => {
    // `confirm` resolves to { ok, checked }. Testing the object tests nothing — it is always
    // truthy — so "Record only" silently interrupted anyway. Caught in a browser, not here,
    // which is why it is written down.
    expect(src).toContain("const { ok: takeIt } = await confirm({");
    expect(src).not.toMatch(/const takeIt = await confirm\(/);
  });

  it("has the running time beside it rather than at the top", () => {
    const bar = src.slice(bottomBar);
    expect(bar).toContain("formatElapsed(elapsedSec)");
    // The status and the input level stay up there: they are read, not acted on.
    const top = src.slice(topBar, bottomBar);
    expect(top).toContain("statusLabel(status)");
    expect(top, "the clock is in both places").not.toContain("formatElapsed(elapsedSec)");
  });

  it("does not tell people to press it above", () => {
    // The hint in the empty transcript points at the button. It pointed up.
    expect(src).not.toMatch(/Start recording" above/);
  });
});
