import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { micConstraints, streamIsLive } from "../lib/stt/mic-constraints";

const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

describe("what the microphone is asked for", () => {
  it("turns processing off in room mode, which is the point of room mode", () => {
    const c = micConstraints("mic", "room");
    expect(c.echoCancellation).toBe(false);
    expect(c.noiseSuppression).toBe(false);
    expect(c.autoGainControl).toBe(true);
  });

  it("leaves processing on for a normal recording", () => {
    const c = micConstraints("mic", "standard");
    expect(c.echoCancellation).toBe(true);
    expect(c.noiseSuppression).toBe(true);
  });

  it("forces echo cancellation for mic + PC audio, room mode or not", () => {
    // Without it the mic re-records the PC audio coming out of the speakers, and every word
    // lands in the transcript twice.
    expect(micConstraints("both", "room").echoCancellation).toBe(true);
    expect(micConstraints("both", "standard").echoCancellation).toBe(true);
  });

  it("is one function, so the check and the recording ask for the same thing", () => {
    // A check that ran with different processing than the recording would be a check of
    // something else — and silence caused by processing is exactly what it exists to catch.
    expect(read("lib/stt/client.ts")).toContain("micConstraints(source, opts?.micMode)");
    expect(read("app/[id]/recording/preflight-check.tsx")).toContain(
      "micConstraints(source, micMode)",
    );
  });
});

describe("whether a checked stream can still be used", () => {
  const track = (readyState: string) => ({ readyState }) as MediaStreamTrack;
  const stream = (tracks: MediaStreamTrack[]) =>
    ({ getAudioTracks: () => tracks }) as unknown as MediaStream;

  it("accepts one that is still open", () => {
    expect(streamIsLive(stream([track("live")]))).toBe(true);
  });

  it("rejects one whose device went away mid-check", () => {
    // An unplugged headset leaves an ended track behind. Handing that to the recording would
    // produce a meeting of pure silence, which is the failure this whole feature exists to stop.
    expect(streamIsLive(stream([track("ended")]))).toBe(false);
    expect(streamIsLive(stream([]))).toBe(false);
    expect(streamIsLive(null)).toBe(false);
    expect(streamIsLive(undefined)).toBe(false);
  });
});

describe("the check itself", () => {
  const src = read("app/[id]/recording/preflight-check.tsx");
  const page = read("app/[id]/recording/page.tsx");

  it("samples on a timer, not on animation frames", () => {
    // `requestAnimationFrame` does not fire at all while the tab is hidden. A phone whose
    // screen dims mid-check would freeze the bar and then report "silent" at the end — the
    // check giving a wrong answer, which is worse than having no check. Confirmed in a browser:
    // document.hidden made rAF fire zero times in a second.
    // The call, not the word: the comment above it explains why it is not used.
    expect(src).not.toContain("requestAnimationFrame(");
    expect(src).toContain("setInterval");
  });

  it("hands its microphone to the recording rather than reopening one", () => {
    // Some phones fail the second getUserMedia of a session, so a check that released its
    // stream could break the recording it just blessed.
    expect(src).toContain("release(peak >= HEARD)");
    expect(page).toContain("micStream: checked ?? undefined");
    expect(read("lib/stt/client.ts")).toContain("streamIsLive(opts?.micStream)");
  });

  it("lets go of the microphone when the screen does", () => {
    expect(src).toContain("useEffect(() => () => release(false), [release])");
  });

  it("drops a check that no longer describes what would be recorded", () => {
    // Changing the source or the mic mode changes the constraints, so what is open was a check
    // of something else.
    expect(src).toMatch(/\}, \[source, micMode\]\)/);
  });

  it("stops sitting on the microphone if nobody starts recording", () => {
    expect(src).toContain("AUTO_STOP_MS");
  });

  it("is offered before recording and not during, and not for PC audio alone", () => {
    expect(page).toContain('!external && !ended && !active && source !== "display"');
  });
});

describe("the recording tips", () => {
  const page = read("app/[id]/recording/page.tsx");

  it("fold away when recording starts", () => {
    expect(page).toContain("setTipsOpen(false)");
    expect(page).toContain("onToggle={(e) => setTipsOpen(e.currentTarget.open)}");
  });

  it("stay open if the reader opens them again", () => {
    // `open={!active}` would have worked until the level meter re-rendered the page, which it
    // does ten times a second — snapping the tips shut under whoever just opened them.
    expect(page).toContain("open={tipsOpen}");
    expect(page).not.toContain("open={!active}");
  });
});
