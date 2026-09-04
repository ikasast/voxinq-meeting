import { prisma } from "@/lib/prisma";
import { type JobKind, type JobStatus, OPEN_STATUSES } from "./types";

// The queue's own operations. Everything that decides *what runs next* is here, so there is
// one place to read when the answer is surprising.
//
// The claim is a single statement rather than a read followed by a write, because two of those
// interleaved would hand the same job to two runners. `FOR UPDATE SKIP LOCKED` is what makes it
// safe: a row another transaction is already claiming is skipped rather than waited for. One
// `next start` is one process today, so this is belt and braces — but it costs nothing, and the
// alternative is a bug that only appears under a second instance and looks like a job running
// twice for no reason.

/** How many jobs may run at once. Phase 3 replaces this with a VRAM budget. */
export const MAX_CONCURRENT = 1;

export type ClaimedJob = {
  id: string;
  kind: string;
  meetingId: string | null;
  params: string;
  attempts: number;
};

export async function enqueue(input: {
  kind: JobKind;
  meetingId?: string | null;
  params?: object;
  vramMb?: number;
  position?: number;
}): Promise<{ id: string }> {
  const job = await prisma.job.create({
    data: {
      kind: input.kind,
      meetingId: input.meetingId ?? null,
      params: JSON.stringify(input.params ?? {}),
      vramMb: input.vramMb ?? 0,
      position: input.position ?? 0,
    },
    select: { id: true },
  });
  return job;
}

/**
 * Take the next job, or nothing when the queue is empty or full.
 *
 * Order is `position` then `createdAt`: with every position left at its default that is plain
 * FIFO, and reordering only has to write positions for the rows it moves.
 */
export async function claimNext(max = MAX_CONCURRENT): Promise<ClaimedJob | null> {
  const rows = await prisma.$queryRaw<ClaimedJob[]>`
    UPDATE "jobs" SET status = 'running', "started_at" = now(), attempts = attempts + 1
    WHERE id = (
      SELECT j.id FROM "jobs" j
      WHERE j.status = 'queued'
        AND (SELECT count(*) FROM "jobs" r WHERE r.status = 'running') < ${max}
      ORDER BY j.position ASC, j."created_at" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING id, kind, "meeting_id" AS "meetingId", params, attempts
  `;
  return rows[0] ?? null;
}

export async function finish(
  id: string,
  status: Extract<JobStatus, "done" | "error" | "cancelled">,
  detail?: string,
): Promise<void> {
  await prisma.job.update({
    where: { id },
    data: { status, detail: detail?.slice(0, 500) ?? null, finishedAt: new Date() },
  });
}

/** Is there already a job of this kind for this meeting that has not finished? */
export async function openJobFor(kind: JobKind, meetingId: string) {
  return prisma.job.findFirst({
    where: { kind, meetingId, status: { in: OPEN_STATUSES } },
    select: { id: true, status: true },
  });
}

/** What is running or waiting, for the busy indicator and (later) the queue screen. */
export async function openJobs() {
  return prisma.job.findMany({
    where: { status: { in: OPEN_STATUSES } },
    orderBy: [{ status: "desc" }, { position: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      kind: true,
      status: true,
      meetingId: true,
      startedAt: true,
      meeting: { select: { title: true } },
    },
  });
}

/**
 * Put back what was running when the process stopped.
 *
 * A job marked `running` with nobody running it is the state a crash or a restart leaves
 * behind, and nothing would ever clear it. They go back to the front of the queue — position
 * is untouched, and they were already ahead of whatever is waiting.
 *
 * **This is a restart, not a resume.** None of the runs can continue from where they were: a
 * half-written set of minutes is discarded, and the job begins again. The reason is recorded so
 * the person watching is not left wondering why it went back to the beginning.
 */
export async function recoverInterrupted(): Promise<number> {
  const { count } = await prisma.job.updateMany({
    where: { status: "running" },
    data: {
      status: "queued",
      startedAt: null,
      detail: "Interrupted by a restart — it will run again from the beginning.",
    },
  });
  return count;
}
