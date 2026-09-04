import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { VALID_REST_SCREEN_SECONDS } from "../lib/settings";

// The recording screen can go black while it records.
//
// A phone has to keep its screen on for the whole meeting — when it sleeps the page is
// suspended and the microphone stops — and that screen is what empties the battery. There is
// no brightness API, so black is the only lever a web page has, and on an OLED panel it is a
// large one.
//
// Two things have to stay true for it to be worth having, and neither is visible in a type:
// the recording must be untouched by it, and the wait the settings screen offers must be a
// wait the server will actually accept.

const root = join(__dirname, "..");
const page = readFileSync(join(root, "app/settings/page.tsx"), "utf8");
const rec = readFileSync(join(root, "app/[id]/recording/page.tsx"), "utf8");

describe("the waits the settings screen offers", () => {
  it("are exactly the ones the server accepts", () => {
    const block = page.slice(
      page.indexOf("const REST_SCREEN_CHOICES"),
      page.indexOf("];", page.indexOf("const REST_SCREEN_CHOICES")),
    );
    const offered = [...block.matchAll(/value:\s*(\d+)/g)].map((m) => Number(m[1]));
    expect(offered.length).toBeGreaterThan(1);
    // A choice the page offers and the server refuses saves nothing and says nothing: the
    // select keeps showing it until the page is reloaded, and then it is back to the old value.
    expect(offered).toEqual(VALID_REST_SCREEN_SECONDS);
  });

  it("include never, because watching the transcript is the other reason to be on that screen", () => {
    expect(VALID_REST_SCREEN_SECONDS).toContain(0);
  });
});

describe("resting the screen", () => {
  it("does not touch the wake lock", () => {
    // The whole thing rests on the screen staying locked awake: release it and the phone
    // sleeps, and on some devices that stops the microphone. The lock follows the recording
    // and nothing else.
    const lock = rec.slice(
      rec.indexOf("// While recording, prevent screen sleep"),
      rec.indexOf("// Rest the screen after a while"),
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
      "formatElapsed(elapsedSec)",
    );
  });
});
