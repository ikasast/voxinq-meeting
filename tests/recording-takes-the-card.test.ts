import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Whether a recording may take the GPU from minutes that are being written is asked once, by
// the recording screen, when record is pressed -- and what it interrupts goes back to the
// front of the queue.
//
// New meeting and quick-record used to ask first, with a dialog of their own that aborted the
// minutes for good: before anything was being recorded (New meeting only sets the meeting up),
// and about minutes alone, not the diarization or recognition the recording screen also knows
// about. Two questions about the same card, with different answers to "what happens to the
// work".

const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

describe("starting a recording", () => {
  it("does not ask about the minutes before the recording screen", () => {
    for (const p of ["app/new/new-meeting-form.tsx", "app/quick-record/page.tsx"]) {
      const src = read(p);
      expect(src, p).not.toContain("abortMinutesAndSettle");
      expect(src, p).not.toContain("currentMinutesBusy");
      expect(src, p).not.toContain("Minutes are being generated");
    }
  });

  it("has nothing left that throws running minutes away to make room", () => {
    expect(existsSync(join(root, "app/api/claude/summary/abort/route.ts"))).toBe(false);
    expect(read("lib/minutes-busy.ts")).not.toContain("summary/abort");
  });

  it("frees the model where the card is taken, since aborting the request does not", () => {
    const src = read("lib/queue/recording.ts");
    expect(src).toContain(
      'if (contenders.some((c) => c.kind === "minutes")) await unloadOllama(await getLlmConfig());',
    );
  });

  it("lets a file be dropped while something else has the card", () => {
    // The file is stored and its recognition waits its turn in the queue, so there is
    // nothing to wait for before dropping it.
    // Dropped anywhere (drop-to-transcribe.tsx) or picked on the start screen (home-start.tsx).
    for (const f of ["app/drop-to-transcribe.tsx", "app/home-start.tsx", "app/transcribe-file.ts"]) {
      expect(read(f), f).not.toContain("useGpuBusy");
    }
  });
});

describe("a run that was interrupted", () => {
  it("reports through finishRun, which leaves a job someone else already decided about", () => {
    const dispatcher = read("lib/queue/dispatcher.ts");
    const run = dispatcher.slice(dispatcher.indexOf("async function run("));
    expect(run).not.toMatch(/await finish\(/);
    expect(run).toContain("await finishRun(");
    expect(read("lib/queue/queue.ts")).toContain('where: { id, status: "running" }');
  });
});
