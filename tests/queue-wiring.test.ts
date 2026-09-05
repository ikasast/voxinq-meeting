import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The queue only works if something starts it and something fills it, and neither of those is
// a function call another test would miss the absence of. Drop the `register()` hook and the
// table simply fills up while nothing runs — every button reports "queued" and stays there.
//
// Every assertion here was checked by making the change it is meant to catch and watching it
// fail. Two others were written and taken out: they asserted that the route no longer
// *imports* `after` or the LLM client, and against a route that imported both they still
// passed — the reason was never found. An assertion that cannot fail is worse than a missing
// one, because it reads as cover.

const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

describe("the dispatcher is started by the server, not by a request", () => {
  const src = read("instrumentation.ts");

  it("runs from the instrumentation hook", () => {
    expect(src).toMatch(/export async function register\(/);
    expect(src).toContain("startDispatcher");
  });

  it("stays out of the edge runtime and the build", () => {
    // Both would import the queue where there is no database to talk to.
    expect(src).toContain('process.env.NEXT_RUNTIME !== "nodejs"');
    expect(src).toContain("phase-production-build");
  });
});

describe("asking for minutes", () => {
  const src = read("app/api/claude/summary/route.ts");

  it("queues the work rather than starting it", () => {
    expect(src).toMatch(/enqueue\(\{\s*kind: "minutes"/);
  });

  it("still refuses a second one for the same meeting", () => {
    // Not the old global refusal — that was the queue's job to replace — but a duplicate for
    // one meeting is not an ordering problem, it is two sets of minutes nobody asked for.
    expect(src).toContain('openJobFor("minutes"');
    expect(src).toContain("409");
  });
});

describe("the busy indicator", () => {
  it("reads the queue rather than a flag beside it", () => {
    const src = read("app/api/busy/route.ts");
    expect(src).toContain("prisma.job.findFirst");
    expect(src).not.toContain('summaryStatus: "processing"');
  });
});

describe("a recording in the queue is shown, not operated on", () => {
  // It is listed so that "why is nothing starting?" has a visible answer. Stopping it there
  // would not stop the recording — it would only hand the card to something else while people
  // are still talking into the microphone.
  const route = read("app/api/jobs/[id]/cancel/route.ts");
  const list = read("app/queue/queue-list.tsx");

  it("is refused by the cancel route", () => {
    expect(route).toContain("RECORDING_KIND");
    expect(route).toMatch(/job\.kind === RECORDING_KIND/);
    expect(route).toContain("status: 409");
  });

  it("is checked before the status check, so a queued one cannot slip through", () => {
    // A recording row is always `running`, but the order is what makes that an invariant of the
    // route rather than of the data.
    expect(route.indexOf("job.kind === RECORDING_KIND")).toBeLessThan(
      route.indexOf('job.status !== "queued"'),
    );
  });

  it("offers no Stop button for it", () => {
    expect(list).toContain("const isRecording = job.kind === RECORDING_KIND");
    // Also gated on `mine` now: the screen lists everybody's rows, and somebody else's is not
    // yours to stop either.
    expect(list).toContain("{!isRecording && job.mine ? (");
    expect(list).toContain("ends with the meeting");
  });

  it("names it rather than printing the raw kind", () => {
    expect(list).toContain('? "Recording"');
  });
});
