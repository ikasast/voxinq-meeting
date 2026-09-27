import { prisma } from "@/lib/prisma";

// Whether minutes are being written for a meeting — asked of the queue, which is the thing
// that knows.
//
// The meeting used to carry the answer in `summaryStatus`, set to `processing` when the work
// was queued and cleared when it finished. That is the same fact written down twice, and the
// two drifted: stopping a job that had not started left sixteen meetings saying their minutes
// were on the way for good, and "Write them all" skipped them because they looked busy.
//
// Now the column records only how the last attempt *ended* — `done`, `error`, or nothing yet —
// which is a fact about the past that nothing else holds. Whether work is under way is read
// from the jobs, where it cannot be stale.

const OPEN = ["queued", "running"];

/**
 * Which of `meetingIds` have a minutes job queued or running.
 *
 * One query for a page of meetings rather than one per card. Scoped like everything else: a
 * list only ever asks about meetings it can already see.
 */
export async function minutesRunningIn(meetingIds: string[]): Promise<Set<string>> {
  if (meetingIds.length === 0) return new Set();
  const jobs = await prisma.job.findMany({
    where: { kind: "minutes", status: { in: OPEN }, meetingId: { in: meetingIds } },
    select: { meetingId: true },
  });
  return new Set(jobs.map((j) => j.meetingId).filter((id): id is string => id !== null));
}

/** Whether this one meeting has minutes queued or running. */
export async function minutesRunningFor(meetingId: string): Promise<boolean> {
  const job = await prisma.job.findFirst({
    where: { kind: "minutes", status: { in: OPEN }, meetingId },
    select: { id: true },
  });
  return job !== null;
}

/**
 * The minutes job holding the GPU, if any, for the routes that refuse rather than contend.
 *
 * `queued` counts: from the caller's point of view the work has been asked for, and whether it
 * has reached the front is the queue's business. Scoped, so the title it names is one the
 * caller can already read.
 */
export async function minutesInFlight(): Promise<{ title: string } | null> {
  const job = await prisma.job.findFirst({
    where: { kind: "minutes", status: { in: OPEN } },
    orderBy: [{ status: "desc" }, { position: "asc" }, { createdAt: "asc" }],
    select: { meeting: { select: { title: true } } },
  });
  return job ? { title: job.meeting?.title ?? "" } : null;
}
