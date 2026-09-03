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

  it("is read and shown by the page", () => {
    expect(page).toMatch(/note\?: string;/);
    expect(page).toMatch(/setRetransWarn\(job\.note \?\? null\)/);
    // Cleared when the next run starts, or last time's explanation is read as this time's.
    expect(page).toMatch(/setRetransWarn\(null\)/);
    expect(page).toMatch(/\{retransWarn \?/);
  });
});
