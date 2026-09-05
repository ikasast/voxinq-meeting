import { asSystem } from "@/lib/db/scope";
import { prisma } from "@/lib/prisma";
import { estimateVramMb } from "./capacity";
import { type JobKind, type JobStatus, OPEN_STATUSES, RECORDING_KIND } from "./types";

// The queue's own operations. Everything that decides *what runs next* is here, so there is
// one place to read when the answer is surprising.
//
// The claim is a single statement rather than a read followed by a write, because two of those
// interleaved would hand the same job to two runners. `FOR UPDATE SKIP LOCKED` is what makes it
// safe: a row another transaction is already claiming is skipped rather than waited for. One
// `next start` is one process today, so this is belt and braces — but it costs nothing, and the
// alternative is a bug that only appears under a second instance and looks like a job running
// twice for no reason.

/**
 * Take the next job that fits, or nothing.
 *
 * Two things are worth knowing about this rule, because both are choices:
 *
 * **A job that does not fit is stepped over, not waited for.** The filter is per row, so a
 * re-transcription sent to Groq — which costs nothing here — starts while a local model holds
 * the card, instead of queueing behind it for no reason. The cost is that strict order is not
 * guaranteed: a stream of free work could keep an expensive job waiting. With a queue this
 * short that is a reordering away, and the alternative is the old rule, which made every
 * remote job wait for hardware it never touched.
 *
 * **A job bigger than the whole budget runs anyway, alone.** Otherwise a budget set too low —
 * or an estimate that is wrong — is a queue that never moves and does not say why.
 */

export type ClaimedJob = {
  id: string;
  kind: string;
  meetingId: string | null;
  params: string;
  attempts: number;
};

/**
 * Put work in the queue.
 *
 * The cost is worked out here rather than by each caller, because three routes queueing three
 * kinds is three places to forget it — and a job priced at zero by accident is one that starts
 * beside anything, which is the failure that looks like a hardware problem.
 */
export async function enqueue(input: {
  kind: JobKind;
  meetingId?: string | null;
  params?: object;
  /** Only for tests, which price their own jobs to describe a queue. */
  vramMb?: number;
  position?: number;
}): Promise<{ id: string }> {
  const params = input.params ?? {};
  const vramMb = input.vramMb ?? (await estimateVramMb(input.kind, params));
  const job = await prisma.job.create({
    data: {
      kind: input.kind,
      meetingId: input.meetingId ?? null,
      params: JSON.stringify(params),
      vramMb,
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
export async function claimNext(budget: number): Promise<ClaimedJob | null> {
  const rows = await prisma.$queryRaw<ClaimedJob[]>`
    UPDATE "jobs" SET status = 'running', "started_at" = now(), attempts = attempts + 1
    WHERE id = (
      SELECT j.id FROM "jobs" j
      WHERE j.status = 'queued'
        AND (
          j."vram_mb" + COALESCE((SELECT sum(r."vram_mb") FROM "jobs" r WHERE r.status = 'running'), 0)
            <= ${budget}
          OR NOT EXISTS (SELECT 1 FROM "jobs" r2 WHERE r2.status = 'running')
        )
      ORDER BY j.position ASC, j."created_at" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING id, kind, "meeting_id" AS "meetingId", params, attempts
  `;
  return rows[0] ?? null;
}

/** What the running jobs are holding, for the queue screen and for deciding what fits. */
export async function runningVramMb(): Promise<number> {
  const r = await prisma.job.aggregate({
    where: { status: "running" },
    _sum: { vramMb: true },
  });
  return r._sum.vramMb ?? 0;
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
/**
 * Every open job on the machine, for the queue screen.
 *
 * Deliberately not scoped to the person looking. The queue is one GPU shared by everybody, and
 * "why has my job not started" is unanswerable if the thing in front of it is invisible — the
 * screen would show an empty list and a job that never moves.
 *
 * What crosses the line is only what is needed to answer that question: whose it is, and what
 * kind of work. **Which meeting is not included for anybody else's rows** — the caller redacts
 * before this reaches a browser, and the redaction is done here rather than in the component so
 * that a title cannot arrive on the client and be styled away.
 */
export async function openJobsAcrossUsers(viewerId: string | null) {
  const rows = await asSystem("the queue screen explains one shared GPU to everybody", () =>
    prisma.job.findMany({
      where: { status: { in: OPEN_STATUSES } },
      orderBy: [{ status: "desc" }, { position: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        kind: true,
        status: true,
        meetingId: true,
        startedAt: true,
        vramMb: true,
        meeting: {
          select: {
            title: true,
            ownerId: true,
            owner: { select: { username: true, name: true, image: true } },
          },
        },
      },
    }),
  );

  return rows.map((j) => {
    const mine = viewerId !== null && j.meeting?.ownerId === viewerId;
    const owner = j.meeting?.owner;
    return {
      id: j.id,
      kind: j.kind,
      status: j.status,
      startedAt: j.startedAt,
      vramMb: j.vramMb,
      mine,
      // Only your own rows carry a meeting. Somebody else's is a kind of work and a person.
      meetingId: mine ? j.meetingId : null,
      title: mine ? (j.meeting?.title ?? null) : null,
      owner: owner
        ? { username: owner.username, name: owner.name, hasImage: owner.image !== null }
        : null,
    };
  });
}

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
      vramMb: true,
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
    // Not recordings. A recording is a browser talking straight to the STT service, and this
    // process restarting does not interrupt it — the card really is still in use. Requeueing it
    // would drop the hold mid-meeting and let something heavy start underneath. When a
    // recording has genuinely stopped, `sweepStaleRecordings` is what notices.
    where: { status: "running", kind: { not: RECORDING_KIND } },
    data: {
      status: "queued",
      startedAt: null,
      detail: "Interrupted by a restart — it will run again from the beginning.",
    },
  });
  return count;
}
