import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// A remote endpoint can answer with the transcript and no timings. The run succeeds, and what
// the user gets is one unbroken utterance per part -- every timestamp click landing at its
// start, and a speaker separation that finds one speaker because there is one line to
// attribute. It happened on a real meeting: 42.8 seconds, one utterance, one speaker, and
// nothing anywhere said why.
//
// The backend now says so, and that sentence has to survive three hops to be read: the job
// stores it, the status endpoint returns it, the page shows it. Each is in a different
// language and nothing type-checks across them, so a dropped field would be silent -- the
// warning would simply never appear again, which looks exactly like nothing being wrong.

const root = join(__dirname, "..");
const server = readFileSync(join(root, "stt-service/server.py"), "utf8");
const page = readFileSync(join(root, "app/[id]/transcript-list.tsx"), "utf8");

describe("what the backend has to say about a run", () => {
  it("is taken off the backend and kept with the job", () => {
    expect(server).toMatch(/getattr\(engine, "note", None\)/);
  });

  it("is included in the status the page polls", () => {
    const status = server.slice(server.indexOf("async def transcribe_status"));
    expect(status).toMatch(/"utterances", "detail", "note"/);
  });

  it("is carried on the job the page is watching", () => {
    // The hop changed when the queue took the work: the runner returns the note, the
    // dispatcher stores it as the job's `detail`, and the page reads it from there rather than
    // from the STT service it no longer polls.
    const runner = readFileSync(join(root, "lib/queue/runners/transcribe.ts"), "utf8");
    expect(runner).toMatch(/note: typeof result\.note === "string"/);
    expect(page).toMatch(/setRetransWarn\(job\.detail \?\? null\)/);
    // Cleared when the next run starts, or last time's explanation is read as this time's.
    expect(page).toMatch(/setRetransWarn\(null\)/);
    expect(page).toMatch(/\{retransWarn \?/);
  });
});
