import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// A recording dropped on New meeting goes through the app's server and the queue, like one
// shared from the phone -- not from the browser straight to the transcription service.
//
// The browser used to run the whole chain itself: upload to the service, poll it until the
// recognition finished, post the lines back, then ask for minutes. Closing the tab lost the
// result of work that had already run, the recognition started the moment the file arrived
// instead of taking its turn, and none of it worked for a browser that cannot reach the
// transcription service, which is any browser outside the private network.

const read = (p: string) => readFileSync(join(__dirname, "..", p), "utf8");

describe("a dropped recording", () => {
  const form = read("app/new/new-meeting-form.tsx");
  const handler = form.slice(form.indexOf("const handleFile"), form.indexOf("const phaseLabel"));

  it("is found, so the checks below are about the real handler", () => {
    expect(handler).toContain("createMeeting(file.name)");
  });

  it("is handed to the server, not to the transcription service", () => {
    expect(form).not.toContain("sttHttpBase");
    expect(handler).toContain("/api/meetings/${meeting.id}/recording");
    expect(handler).not.toContain("/upload/");
  });

  it("is recognised by a queued job, which asks for the minutes when it is done", () => {
    expect(handler).toContain("/api/meetings/${meeting.id}/transcribe");
    expect(handler).toContain("thenMinutes: true");
    // Nothing the queue now does is left for the tab to do.
    expect(handler).not.toContain("apply-transcript");
    expect(handler).not.toContain("/api/claude/summary");
    expect(handler).not.toContain("/status");
  });

  it("is ended before it is queued, because a meeting still open is still being recorded", () => {
    expect(handler.indexOf("/end`")).toBeGreaterThan(handler.indexOf("/recording`"));
    expect(handler.indexOf("/transcribe`")).toBeGreaterThan(handler.indexOf("/end`"));
  });
});

describe("minutes after a recognition", () => {
  const dispatcher = read("lib/queue/dispatcher.ts");

  it("are queued by the queue, not by whoever asked", () => {
    const route = read("app/api/meetings/[id]/transcribe/route.ts");
    expect(route).toContain("thenMinutes: body.thenMinutes === true");
    expect(read("lib/queue/runners/transcribe.ts")).toContain(
      "thenMinutes: params.thenMinutes === true",
    );
  });

  it("are queued before the recognition is marked done", () => {
    // A page that sees the recognition finish looks again; it must find the minutes already
    // on their way, not a moment where neither is.
    const branch = dispatcher.slice(dispatcher.indexOf('case "transcribe"'));
    const chained = branch.indexOf("queueMinutesAfter(job.meetingId");
    const done = branch.indexOf('finishRun(job.id, "done"');
    expect(chained).toBeGreaterThan(-1);
    expect(done).toBeGreaterThan(chained);
  });

  it("are not asked for twice, nor for a recording with nothing said in it", () => {
    const fn = dispatcher.slice(dispatcher.indexOf("async function queueMinutesAfter"));
    expect(fn).toContain('openJobFor("minutes", meetingId)');
    expect(fn).toContain("if (lines === 0) return;");
  });
});

describe("the meeting page while its recognition waits", () => {
  it("asks the queue, and hands the job to the transcript to follow", () => {
    const page = read("app/[id]/page.tsx");
    expect(page).toContain('kind: "transcribe", meetingId: meeting.id, status: { in: ["queued", "running"] }');
    expect(page).toContain("transcribeJobId={external ? null : (transcribing?.id ?? null)}");
    // And says so under the title, in the row that is there only while something is under way.
    expect(page).toContain('transcribing ? t("Transcribing…") : null');
  });

  it("says the minutes are coming when they are, rather than that they cannot be written", () => {
    const page = read("app/[id]/page.tsx");
    expect(page).toContain("minutesAfterTranscript={minutesAfter}");
    expect(read("app/[id]/summary-section.tsx")).toContain(
      't("They will be written once the transcription is done.")',
    );
  });

  it("says where it has got to rather than that there is no transcript", () => {
    const list = read("app/[id]/transcript-list.tsx");
    expect(list).toContain("awaitJob(transcribeJobId, report, () => stopped)");
    // Busy from the first frame, so the button is never offered for a transcript on its way.
    expect(list).toContain("useState(Boolean(transcribeJobId))");
    expect(list).toContain('retransing && retransStatus ? retransStatus : t("No transcript.")');
    // And does not offer to restore a transcript that is already being made.
    expect(list).toContain("transcripts.length === 0 && !retransing ?");
  });
});
