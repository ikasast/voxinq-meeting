import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Inside the Android app the recording page hands the recording to the app (lib/stt/native.ts).
// Each of these is a property that fails without a sound: a page that saves every line the app
// has already saved, a wake lock holding the screen on for an app that does not need it, or a
// page that stops the app's recording because somebody looked at another meeting.

const page = readFileSync(join(__dirname, "..", "app/[id]/recording/page.tsx"), "utf8");

function between(from: string, to: string): string {
  const a = page.indexOf(from);
  expect(a, `${from} not found`).toBeGreaterThan(-1);
  const b = page.indexOf(to, a);
  expect(b, `${to} not found after ${from}`).toBeGreaterThan(a);
  return page.slice(a, b);
}

describe("the recording page inside the Android app", () => {
  it("hands the recording to the app when the app is there", () => {
    const start = between("const startRecording = useCallback", "const stopRecording = useCallback");
    expect(start).toContain("if (hasNativeRecorder())");
    // One set of options for both, so what the app is asked for cannot drift from the browser.
    expect(start).toMatch(/startNative\(nativeHandlers, \{ \.\.\.options/);
    expect(start).toMatch(/startMic\(handlers, \{\s+\.\.\.options/);
  });

  it("does not save a line the app has already saved", () => {
    const handlers = between("const nativeHandlers = useMemo", "// In the app, ask whether");
    expect(handlers).toContain("onSaved:");
    expect(handlers).not.toContain("saveTranscript");
    expect(handlers).not.toContain('method: "PATCH"');
  });

  it("reloads the transcript when the app comes back into view", () => {
    expect(page).toContain("onResync: () => void resync()");
    expect(page).toContain("/api/meetings/${meetingId}/live");
  });

  it("picks up a recording the app is already making instead of starting another", () => {
    expect(page).toContain("attachNative(nativeHandlers, s.status)");
    expect(page).toContain("s.meetingId !== meetingId");
  });

  it("lets the screen sleep in the app", () => {
    const lock = between("// While recording, prevent screen sleep", "// Rest the screen after a while");
    expect(lock).toContain("if (!recording || native) return;");
  });

  it("does not ask before leaving, because leaving does not stop the app", () => {
    // In a WebView the browser's "leave this page?" is a modal dialog, and it guarded a
    // recording that carries on without the page. Found when a reload froze behind it.
    const warn = between("// Warn before leaving while recording", "// While recording, prevent screen sleep");
    expect(warn).toContain("if (!recording || native) return;");
  });

  it("leaves the app's recording, and its GPU, alone when the page goes away", () => {
    const leaving = between("// Cleanup", "const elapsedSec");
    expect(leaving).toContain("nativeRef.current.detach()");
    expect(leaving).toContain("if (!nativeRef.current) release();");
  });
});
