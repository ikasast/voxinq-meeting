import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// When nothing was recognised during a meeting -- a host that cannot keep up with speech, or a
// recording left to run beside something else that had the card -- the transcript is made from
// the whole file at the end, by a queued job.
//
// The page used to run that recognition itself and wait for it. When the route it started it
// through began queueing instead, the page went on expecting a finished result, and reported a
// failure for work that was under way (then failed to start the minutes, because there was no
// transcript yet). And it only ever looked at the hardware: a meeting recorded with "Record only"
// was never recognised at the end at all.

const read = (p: string) => readFileSync(join(__dirname, "..", p), "utf8");
const page = read("app/[id]/recording-dock.tsx");

describe("the end of a meeting with no live transcript", () => {
  const at = page.indexOf("const transcribeAfterRecording");
  const fn = page.slice(at, page.indexOf("const closeMeeting"));

  it("is found, so the checks below are about the real function", () => {
    expect(at).toBeGreaterThan(-1);
  });

  it("covers a recording left to run beside something else, not only a slow host", () => {
    expect(fn).toContain('if (!awaitingTranscript && !(deferred && transcripts.length === 0)) return "live";');
    // Set whenever recording starts without live recognition, whichever the reason.
    expect(page).toContain("if (!live) setAwaitingTranscript(true);");
  });

  it("can be ended with minutes or speakers, though nothing is on screen yet", () => {
    // These were disabled for an empty transcript, which on a host that transcribes at the end
    // is every meeting: the only way out was "End only".
    const guard = "disabled={busy !== \"none\" || (transcripts.length === 0 && !awaitingTranscript)}";
    expect(page.split(guard).length - 1).toBe(2);
  });

  it("queues the recognition rather than running it from the page", () => {
    expect(fn).toContain("/api/meetings/${meetingId}/transcribe");
    expect(fn).not.toContain("/status");
    expect(page).not.toContain("transcribe-recording");
  });

  it("recognises with the model and language this meeting was recorded with", () => {
    expect(fn).toContain("const model = activeModel;");
    expect(fn).toContain("meetingLangRef.current ?? sttLanguageRef.current");
  });

  it("leaves the minutes to the queue when there is no transcript yet", () => {
    const end = page.slice(page.indexOf("const endWithMinutes"), page.indexOf("const endWithDiarization"));
    expect(end).toContain("transcribeAfterRecording(minutes)");
    // Asked for directly only when the transcript already exists.
    const ask = end.indexOf('fetch("/api/claude/summary"');
    expect(ask).toBeGreaterThan(end.indexOf('if (later === "live")'));
  });

  it("ends the meeting before queueing, as every other path does", () => {
    // The ending itself is one shared step; each way out takes it before asking for anything.
    const close = page.slice(page.indexOf("const closeMeeting"), page.indexOf("const endWithMinutes"));
    expect(close).toContain("/end`");
    expect(close.indexOf("/end`")).toBeGreaterThan(close.indexOf("await stopRecording()"));
    for (const name of ["endWithMinutes", "endWithDiarization", "endOnly"]) {
      const from = page.indexOf(`const ${name}`);
      const body = page.slice(from, page.indexOf("}, [", from));
      expect(body.indexOf("closeMeeting("), name).toBeGreaterThan(-1);
      expect(body.indexOf("transcribeAfterRecording("), name).toBeGreaterThan(body.indexOf("closeMeeting("));
    }
  });
});

describe("the route that took a transcript from the browser", () => {
  it("is gone, now that nothing recognises in the browser", () => {
    expect(() => read("app/api/meetings/[id]/apply-transcript/route.ts")).toThrow();
    expect(() => read("lib/stt/transcribe-recording.ts")).toThrow();
  });
});
