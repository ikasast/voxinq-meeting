import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Starting a transcription must go through the app's own server, never straight to the STT
// service, because that request is the one that carries the API key for a remote endpoint.
//
// This exists because the rule was applied to one caller and not the other. lib/stt/
// transcribe-recording.ts was moved to the server route; app/[id]/transcript-list.tsx has its
// own copy of start-and-poll and kept calling the service directly, so **Re-transcribe never
// reached a configured remote endpoint at all** -- it silently used whatever the service had
// loaded, and no error said so. Grepping for the shared function's callers does not find a
// caller that reimplements it.
//
// Polling and every other STT call may stay direct: none of them carry a credential.

const root = join(__dirname, "..");
const CALLERS = [
  "lib/stt/transcribe-recording.ts",
  "app/[id]/transcript-list.tsx",
  "app/[id]/recording/page.tsx",
];

describe("starting a transcription", () => {
  for (const file of CALLERS) {
    const src = readFileSync(join(root, file), "utf8");

    it(`${file} does not POST straight to the STT service`, () => {
      // A start is a POST to /transcribe/<id> with no /status on the end.
      const direct = /\$\{(?:base|sttHttpBase\(\))\}\/transcribe\/\$\{[^}]+\}`/g;
      const hits = [...src.matchAll(direct)]
        .map((m) => src.slice(Math.max(0, m.index - 200), m.index + 80))
        .filter((around) => /method:\s*"POST"/.test(around));
      expect(
        hits.length,
        `${file} starts a job on the STT service directly; the API key would not reach it`,
      ).toBe(0);
    });
  }

  it("at least one caller uses the app's route, so the test is watching something real", () => {
    const used = CALLERS.map((f) => readFileSync(join(root, f), "utf8")).filter((s) =>
      /\/api\/meetings\/\$\{[^}]+\}\/transcribe`/.test(s),
    );
    expect(used.length).toBeGreaterThan(0);
  });

  it("attaches an endpoint only when one was resolved", () => {
    // Moved out of the route when the queue took the work: the job runs later, so resolving
    // where it goes had to become a function the runner can call too.
    const src = readFileSync(join(root, "lib/queue/runners/transcribe.ts"), "utf8");
    // A profile that could not be found is refused rather than quietly falling back to local:
    // recognising somewhere other than where you asked is the worse failure.
    expect(src).toMatch(/if \(profile\) \{\s+payload\.remote =/);
    expect(src).toContain("wantedId && !profile");
    // "local" has to be expressible, or the picker cannot ask for this machine.
    expect(src).toContain('asked === "local"');
  });

  it("refuses a missing endpoint while someone is still looking at the button", () => {
    // Resolved at enqueue as well as at run: a job that discovers its endpoint is gone when it
    // reaches the front of the queue reports it minutes after the click.
    const route = readFileSync(join(root, "app/api/meetings/[id]/transcribe/route.ts"), "utf8");
    expect(route).toContain("resolveDestination");
    expect(route).toContain("400");
  });
});
