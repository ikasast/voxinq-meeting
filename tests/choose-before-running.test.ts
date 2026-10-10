import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Minutes and speaker separation ask how before they run: from the recording page when the
// meeting ends, and from the meeting page the first time minutes are written.

const read = (p: string) => readFileSync(path.join(__dirname, "..", p), "utf8");

describe("ending a meeting", () => {
  const page = read("app/[id]/recording-dock.tsx");

  it("opens the dialog instead of running straight away", () => {
    expect(page).toContain('setEndDialog("minutes");');
    expect(page).toContain('setEndDialog("diarize");');
    expect(page).not.toContain("onClick={endWithMinutes}");
    expect(page).not.toContain("onClick={endWithDiarization}");
  });

  it("writes the minutes the way the dialog said, live or queued", () => {
    expect(page).toContain("body: JSON.stringify({ meetingId, ...minutes })");
    expect(page).toContain("...(thenMinutes ? { minutesParams: thenMinutes } : {})");
    const dispatcher = read("lib/queue/dispatcher.ts");
    expect(dispatcher).toContain("queueMinutesAfter(job.meetingId, r.minutesParams)");
    expect(dispatcher).toContain('enqueue({ kind: "minutes", meetingId, params })');
  });

  it("hands the speaker count to the meeting page", () => {
    expect(page).toContain("&speakers=${choice.speakers}");
    const list = read("app/[id]/transcript-list.tsx");
    expect(list).toContain('params.get("speakers")');
    expect(list).toContain('params.delete("speakers")');
    expect(list).toContain("let want = speakers ?? Number(numSpeakers.trim());");
  });
});

describe("the first minutes of a meeting", () => {
  it("open the options rather than writing at once", () => {
    const section = read("app/[id]/summary-section.tsx");
    const empty = section.slice(section.indexOf("if (!current) {"));
    expect(section.indexOf("const optionsPanel")).toBeLessThan(section.indexOf("if (!current) {"));
    expect(empty).toContain('<GenButton onClick={toggleOptions} busy={genBusy} label={t("Retry")} />');
    expect(empty).toContain('label={t("Generate minutes")}');
    expect(empty).toContain("{canGenerate && !readOnly ? optionsPanel : null}");
  });
});
