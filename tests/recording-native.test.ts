import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Inside the Android app the recording is handed to the app (lib/stt/native.ts). Since v4 the
// handing is done by the app-wide recorder (app/recorder.tsx), not the recording page. Each of
// these is a property that fails without a sound: a page that saves every line the app has
// already saved, a wake lock holding the screen on for an app that does not need it, or a page
// that stops the app's recording because somebody looked at another meeting.

const root = join(__dirname, "..");
const recorder = readFileSync(join(root, "app/recorder.tsx"), "utf8");
const page = readFileSync(join(root, "app/[id]/recording/page.tsx"), "utf8");

function between(src: string, from: string, to: string): string {
  const a = src.indexOf(from);
  expect(a, `${from} not found`).toBeGreaterThan(-1);
  const b = src.indexOf(to, a);
  expect(b, `${to} not found after ${from}`).toBeGreaterThan(a);
  return src.slice(a, b);
}

describe("recording inside the Android app", () => {
  it("hands the recording to the app when the app is there", () => {
    const start = between(recorder, "const start = useCallback", "const stop = useCallback");
    expect(start).toContain("const native = hasNativeRecorder();");
    // One set of options for both, so what the app is asked for cannot drift from the browser.
    expect(start).toMatch(/startNative\(appHandlers\(r\.meetingId\), \{ \.\.\.r\.options/);
    expect(start).toMatch(/startMic\(micHandlers\(r\.meetingId\), \{\s+\.\.\.r\.options/);
    // And the page asks the recorder, not either of them.
    expect(page).toContain("await recStart({");
    expect(page).not.toContain("startMic(");
    expect(page).not.toContain("startNative(");
  });

  it("does not save a line the app has already saved", () => {
    const handlers = between(recorder, "const appHandlers = useCallback", "// In the app, ask whether");
    expect(handlers).toContain("onSaved:");
    expect(handlers).not.toContain("keepLine");
    expect(handlers).not.toContain('method: "PATCH"');
  });

  it("reloads the transcript when the app comes back into view", () => {
    expect(recorder).toContain('onResync: () => emit({ kind: "resync", meetingId })');
    expect(page).toContain('} else if (e.kind === "resync") {');
    expect(page).toContain("/api/meetings/${meetingId}/live");
  });

  it("picks up a recording the app is already making instead of starting another", () => {
    expect(recorder).toContain("attachNative(appHandlers(meetingId), s.status)");
    expect(recorder).toContain("if (cancelled || !s?.recording || !s.meetingId || handle.current) return;");
  });

  it("lets the screen sleep in the app", () => {
    const lock = between(recorder, "// Keep the screen awake while recording", "// Closing the tab or typing an address");
    expect(lock).toContain("if (!recording || native) return;");
  });

  it("does not ask before closing the tab, because closing it does not stop the app", () => {
    // In a WebView the browser's "leave this page?" is a modal dialog, and it guarded a
    // recording that carries on without the page. Found when a reload froze behind it.
    const warn = between(recorder, "// Closing the tab stops a browser recording", "// Keep the screen awake while recording");
    expect(warn).toContain("if (!recording || native) return;");
  });

  it("leaves the app's recording, and its GPU, alone when the page goes away", () => {
    const hide = between(recorder, "// Closing the tab or typing an address", "const setQuiet = useCallback");
    expect(hide).toContain("if (s && !s.native) releaseCard(s.meetingId);");
    // Leaving the recording screen stops nothing at all now, in the app or out of it.
    expect(page).not.toContain(".detach()");
    expect(page).not.toMatch(/return \(\) => \{\s*void handleRef/);
  });
});
