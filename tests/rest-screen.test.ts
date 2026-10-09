import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { REST_SCREEN_SECONDS, defaultRestSeconds, restSecondsFrom } from "../app/rest-screen";

// The recording screen can go black while it records.
//
// A phone has to keep its screen on for the whole meeting — when it sleeps the page is
// suspended and the microphone stops — and that screen is what empties the battery. There is
// no brightness API, so black is the only lever a web page has, and on an OLED panel it is a
// large one.
//
// It hides the live transcript, so whether it is wanted depends on the device: a phone in a
// pocket wants it, a computer on the table does not. The wait is kept per device, and the
// recording must be untouched by it.

const root = join(__dirname, "..");
const page = readFileSync(join(root, "app/settings/page.tsx"), "utf8");
const rec = readFileSync(join(root, "app/[id]/recording/page.tsx"), "utf8");

const card = readFileSync(join(root, "app/settings/rest-screen-setting.tsx"), "utf8");
const phone = { app: false, touchFirst: true };
const computer = { app: false, touchFirst: false };

describe("the wait, per device", () => {
  it("is a minute on a phone, a tablet or the app, and never on a computer, until chosen", () => {
    expect(defaultRestSeconds(phone)).toBe(60);
    expect(defaultRestSeconds({ app: true, touchFirst: false })).toBe(60);
    expect(defaultRestSeconds(computer)).toBe(0);
    expect(restSecondsFrom(null, phone)).toBe(60);
    expect(restSecondsFrom(null, computer)).toBe(0);
  });

  it("follows what this device chose, never included", () => {
    expect(restSecondsFrom("0", phone)).toBe(0);
    expect(restSecondsFrom("300", computer)).toBe(300);
  });

  it("ignores a stored value it does not offer", () => {
    // From an older build, or typed into the console: the device's default, not a guess.
    expect(restSecondsFrom("45", phone)).toBe(60);
    expect(restSecondsFrom("soon", computer)).toBe(0);
  });

  it("offers every wait, with never among them", () => {
    expect(REST_SCREEN_SECONDS).toContain(0);
    for (const s of REST_SCREEN_SECONDS) expect(card).toContain(`${s}: t(`);
  });

  it("is no longer a setting on the account", () => {
    // One answer for every device was the problem. A value saved there before is simply unused.
    expect(readFileSync(join(root, "lib/settings.ts"), "utf8")).not.toContain("restScreenSeconds");
    expect(readFileSync(join(root, "lib/settings-scope.ts"), "utf8")).not.toContain("restScreenSeconds");
    expect(page).toContain("<RestScreenSetting");
    expect(rec).toContain("useSyncExternalStore(subscribeRestSeconds, readRestSeconds, () => 0)");
  });
});

describe("resting the screen", () => {
  it("does not touch the wake lock", () => {
    // The whole thing rests on the screen staying locked awake: release it and the phone
    // sleeps, and on some devices that stops the microphone. The lock follows the recording
    // and nothing else.
    // The lock is the app-wide recorder's (app/recorder.tsx), out of the resting screen's reach.
    const recorder = readFileSync(join(root, "app/recorder.tsx"), "utf8");
    const lock = recorder.slice(
      recorder.indexOf("// Keep the screen awake while recording"),
      recorder.indexOf("// Closing the tab or typing an address"),
    );
    expect(lock, "the wake-lock effect was not found where this test expects it").toContain(
      "wakeLock",
    );
    expect(lock, "resting must not be able to release the screen lock").not.toContain("resting");
  });

  it("re-arms after a touch, rather than only firing once", () => {
    // The point of the request: coming back from the rest screen must not be the end of it.
    // `resting` in the dependency list is what re-runs the effect — and re-arms the timer —
    // when the screen is woken.
    const at = rec.indexOf("if (!active || restAfter <= 0 || resting) return;");
    expect(at, "the idle timer was not found").toBeGreaterThan(-1);
    const deps = rec.slice(at, rec.indexOf("}, [", at) + 40);
    expect(deps).toContain("[active, restAfter, resting]");
  });

  it("cannot outlive the recording", () => {
    // Otherwise stopping while rested leaves a black screen with no way back: the overlay's
    // own tap sets `resting` false, but a screen that says "Recording" when nothing is being
    // recorded has already told the worst possible lie.
    expect(rec).toContain("if (!active) setResting(false);");
  });

  it("says it is still recording", () => {
    const overlay = rec.slice(rec.indexOf("{resting ? ("), rec.indexOf("{/* Sticky top bar"));
    expect(overlay).toContain("bg-black");
    expect(overlay).toMatch(/Recording/);
    expect(overlay, "the running time is the proof that it is still going").toContain(
      "runningTime(elapsedSec)",
    );
  });
});
