import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { deliverEnd, type Stoppable } from "../lib/recording/deliver-end";

// Pressing Stop used to leave the button a red square and the clock running until the service
// had recognised the last segment, waited for translations, saved the recording and said
// `closed` — up to 10 s in the browser and 45 s in the app. The screen now says it stopped at
// once, and the end of the recording is delivered behind it (app/recorder.tsx). These hold the
// two halves to that: what has to happen still happens, in order, and the screen does not wait.

const root = join(__dirname, "..");
const recorder = readFileSync(join(root, "app/recorder.tsx"), "utf8");
const dock = readFileSync(join(root, "app/[id]/recording-dock.tsx"), "utf8");

function between(src: string, from: string, to: string): string {
  const a = src.indexOf(from);
  expect(a, `${from} not found`).toBeGreaterThan(-1);
  const b = src.indexOf(to, a);
  expect(b, `${to} not found after ${from}`).toBeGreaterThan(a);
  return src.slice(a, b);
}

/** A promise and the means to settle it from outside. */
function deferred<T = void>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe("delivering the end of a stopped recording", () => {
  it("waits for the line the last segment produced, which arrives while the handle stops", async () => {
    const saves = new Set<Promise<void>>();
    const lastLine = deferred();
    const steps: string[] = [];
    const handle: Stoppable = {
      stop: async () => {
        steps.push("stop");
        // The service's final arrives before `closed`; its save is still in flight.
        saves.add(lastLine.promise.then(() => void steps.push("saved")));
      },
    };
    const done = deliverEnd({
      handle,
      saves,
      savesMs: 10_000,
      mayRelease: () => true,
      release: () => steps.push("release"),
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(steps).toEqual(["stop"]);
    lastLine.resolve();
    await done;
    expect(steps).toEqual(["stop", "saved", "release"]);
  });

  it("does not wait forever for a save that never finishes", async () => {
    vi.useFakeTimers();
    try {
      const release = vi.fn();
      const done = deliverEnd({
        handle: { stop: async () => {} },
        saves: new Set([new Promise<void>(() => {})]),
        savesMs: 15_000,
        mayRelease: () => true,
        release,
      });
      await vi.advanceTimersByTimeAsync(14_999);
      expect(release).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      await done;
      expect(release).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it("stops what a start still opening turns into", async () => {
    const opened = deferred<Stoppable>();
    const stop = vi.fn(async () => {});
    const done = deliverEnd({ handle: opened.promise, saves: new Set(), savesMs: 1, mayRelease: () => true, release: () => {} });
    opened.resolve({ stop });
    await done;
    expect(stop).toHaveBeenCalledOnce();
  });

  it("carries on when the start failed or the stop threw", async () => {
    const release = vi.fn();
    await deliverEnd({ handle: Promise.reject(new Error("no mic")), saves: new Set(), savesMs: 1, mayRelease: () => true, release });
    await deliverEnd({
      handle: { stop: () => Promise.reject(new Error("gone")) },
      saves: new Set(),
      savesMs: 1,
      mayRelease: () => true,
      release,
    });
    expect(release).toHaveBeenCalledTimes(2);
  });

  it("keeps the card when the same meeting is recording again", async () => {
    const release = vi.fn();
    await deliverEnd({ handle: { stop: async () => {} }, saves: new Set(), savesMs: 1, mayRelease: () => false, release });
    expect(release).not.toHaveBeenCalled();
  });

  it("waits for the stop before it", async () => {
    const earlier = deferred();
    const release = vi.fn();
    const done = deliverEnd({ handle: null, saves: new Set(), savesMs: 1, earlier: earlier.promise, mayRelease: () => true, release });
    await new Promise((r) => setTimeout(r, 0));
    expect(release).not.toHaveBeenCalled();
    earlier.resolve();
    await done;
    expect(release).toHaveBeenCalledOnce();
  });
});

describe("the recorder's Stop", () => {
  const stop = between(recorder, "const stop = useCallback", "const settled = useCallback");

  it("resets the screen before anything is waited for", () => {
    expect(stop).not.toMatch(/^\s*await /m);
    expect(stop.indexOf("finish();")).toBeGreaterThan(-1);
    expect(stop.indexOf("finish();")).toBeLessThan(stop.indexOf("deliverEnd("));
    // The handlers hear that they are stopping before the screen is reset, so nothing they
    // report afterwards puts it back.
    expect(stop.indexOf("r.stopping = true")).toBeLessThan(stop.indexOf("finish();"));
  });

  it("returns the delivery, for whoever needs the end on the server", () => {
    expect(stop).toContain("return done;");
    expect(stop).toContain("finishingWork.current = { at, done };");
    expect(stop).toContain("return finishingWork.current?.done ?? Promise.resolve();");
  });

  it("lets a stopping recording save lines but not touch the screen", () => {
    for (const name of ["const micHandlers = useCallback", "const appHandlers = useCallback"]) {
      const handlers = between(recorder, name, name.startsWith("const mic") ? "// What the app's recorder" : "// In the app, ask whether");
      expect(handlers).toContain("const r = newRun();");
      expect(handlers).toContain("onStatus: live(");
      expect(handlers).toContain("onLevel: live(level10)");
      expect(handlers).toContain("onPartial: live(");
    }
    const mic = between(recorder, "const micHandlers = useCallback", "// What the app's recorder");
    expect(mic).toContain("r.saves.add(saving);");
    expect(mic).not.toMatch(/onFinal: live\(/);
  });

  it("makes a new start wait for a stop still delivering", () => {
    const start = between(recorder, "const start = useCallback", "// Stop says so on the screen at once");
    expect(start).toContain("const before = finishingWork.current;");
    expect(start.indexOf("await before.done;")).toBeLessThan(start.indexOf("startNative("));
    // By the session itself: the same meeting may have been started again meanwhile.
    expect(start).toContain("if (sessionRef.current !== me) return;");
  });

  it("still asks before a tab with an undelivered end is closed", () => {
    const guard = between(recorder, "// Closing the tab stops a browser recording", "// Keep the screen awake");
    expect(guard).toContain("const delivering = finishing !== null && !finishing.native;");
    expect(guard).toContain("if (!(recording && !native) && !delivering) return;");
  });
});

describe("the recording screen", () => {
  it("ends the meeting only once a stop pressed earlier has delivered", () => {
    const stopRecording = between(dock, "const stopRecording = useCallback", "// Change recording source");
    expect(stopRecording).toContain("if (mine) await recStop();");
    expect(stopRecording).toContain("else await recSettled(meetingId);");
    const close = between(dock, "const closeMeeting = useCallback", "// Asked from the dialog");
    expect(close.indexOf("await stopRecording();")).toBeLessThan(close.indexOf("/api/meetings/${meetingId}/end"));
  });

  it("says the end is on its way, and Stopping… while ending", () => {
    expect(dock).toContain("const finishingHere = recorder.finishing?.meetingId === meetingId;");
    expect(dock).toContain("{ended && (active || finishingHere) ? (");
    expect(dock).toContain('t("Saving the end of the recording…")');
  });
});
