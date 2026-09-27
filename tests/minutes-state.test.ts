import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { asSystem } from "../lib/db/scope";
import { minutesInFlight, minutesRunningFor, minutesRunningIn } from "../lib/meetings/minutes-state";
import { prisma } from "../lib/prisma";

// "Are minutes being written for this meeting" has one answer, and it is the queue's.
//
// It used to be written down twice: once as a job, and once as `summaryStatus = 'processing'`
// on the meeting. The two drifted -- stopping a job that had not started left sixteen meetings
// saying their minutes were on the way for good, and "Write them all" skipped them because they
// looked busy. The column now records only how the last attempt ended.

const read = (p: string) => readFileSync(join(__dirname, "..", p), "utf8");

describe("nothing writes the running state onto the meeting", () => {
  it("is not written when the work is asked for", () => {
    for (const p of ["app/api/claude/summary/route.ts", "app/api/claude/summary/bulk/route.ts"]) {
      expect(read(p), p).not.toContain('summaryStatus: "processing"');
    }
  });

  it("is not a value the runner or the stop paths use either", () => {
    for (const p of [
      "lib/queue/runners/minutes.ts",
      "app/api/jobs/[id]/cancel/route.ts",
      "app/api/meetings/[id]/minutes/stop/route.ts",
    ]) {
      expect(read(p), p).not.toContain('"processing"');
    }
  });

  it("needs no sweep, because nothing can be left behind", () => {
    // The sweep existed to free meetings stuck saying it. There is nothing to free now.
    expect(read("lib/queue/queue.ts")).not.toContain("releaseAbandonedMinutes");
    expect(read("lib/queue/dispatcher.ts")).not.toContain("releaseAbandonedMinutes");
  });

  it("is read from the queue by every screen that shows it", () => {
    expect(read("app/meeting-list-pane.tsx")).toContain("minutesRunningIn(ids)");
    expect(read("app/[id]/page.tsx")).toContain("minutesRunningFor(meeting.id)");
    // And by the two routes that refuse rather than contend for the card.
    expect(read("app/api/ask/route.ts")).toContain("minutesInFlight()");
    expect(read("app/api/meetings/[id]/suggest-corrections/route.ts")).toContain("minutesInFlight()");
  });
});

// Against a real database, because what is being replaced is a database read.
const ENABLED = process.env.VOXINQ_QUEUE_DB_TESTS === "1";
const sys = <T>(fn: () => Promise<T>) => asSystem("minutes-state tests", fn);

describe.skipIf(!ENABLED)("what the queue says, from the database", () => {
  it("counts a job that is queued as well as one that is running", () =>
    sys(async () => {
      const meetings = await Promise.all(
        ["queued", "running", "none"].map((tag) =>
          prisma.meeting.create({
            data: { title: `minutes-state ${tag}`, startedAt: new Date() },
            select: { id: true },
          }),
        ),
      );
      const [queued, running, none] = meetings.map((m) => m.id);
      const jobs = await Promise.all([
        prisma.job.create({ data: { kind: "minutes", status: "queued", meetingId: queued }, select: { id: true } }),
        prisma.job.create({ data: { kind: "minutes", status: "running", meetingId: running }, select: { id: true } }),
        // A finished one is not "under way", and neither is another kind of work.
        prisma.job.create({ data: { kind: "minutes", status: "done", meetingId: none }, select: { id: true } }),
        prisma.job.create({ data: { kind: "diarize", status: "running", meetingId: none }, select: { id: true } }),
      ]);
      try {
        const set = await minutesRunningIn([queued, running, none]);
        expect([...set].sort()).toEqual([queued, running].sort());
        expect(await minutesRunningFor(queued)).toBe(true);
        expect(await minutesRunningFor(none)).toBe(false);
        expect((await minutesInFlight())?.title).toContain("minutes-state");
      } finally {
        await prisma.job.deleteMany({ where: { id: { in: jobs.map((j) => j.id) } } });
        await prisma.meeting.deleteMany({ where: { id: { in: [queued, running, none] } } });
      }
    }));

  it("asks nothing of the database for an empty list", () =>
    sys(async () => {
      expect(await minutesRunningIn([])).toEqual(new Set());
    }));
});
