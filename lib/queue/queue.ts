import { asSystem } from "@/lib/db/scope";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { estimateVramMb } from "./capacity";
import type { JobMetrics } from "./metrics";
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
  /** Whose it is, so the dispatcher can run it as them without a join. */
  ownerId: string | null;
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
 *
 * **Minutes go one at a time**, whatever the budget says. The memory is not the only thing they
 * share: they all go to the same model, which answers one request at a time and keeps the rest
 * waiting without a word -- and a request that hears nothing for five minutes is abandoned by
 * the HTTP client. That is how a day's minutes sent together became one set of minutes and a
 * page of "Headers Timeout Error". A cloud model would take them together, but its rate limit
 * would not; one at a time is slower there and never wrong.
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
        AND (
          j.kind <> 'minutes'
          OR NOT EXISTS (SELECT 1 FROM "jobs" r3 WHERE r3.status = 'running' AND r3.kind = 'minutes')
        )
      ORDER BY j.position ASC, j."created_at" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING id, kind, "meeting_id" AS "meetingId", "owner_id" AS "ownerId", params, attempts
  `;
  return rows[0] ?? null;
}

type Ending = Extract<JobStatus, "done" | "error" | "cancelled">;

function ending(status: Ending, detail?: string, metrics?: JobMetrics) {
  return {
    status,
    detail: detail?.slice(0, 500) ?? null,
    finishedAt: new Date(),
    // Only when the run said something: a stop from the queue screen reports nothing, and
    // must not wipe what the runner had already written for the same job.
    ...(metrics ? { metrics: metrics as Prisma.InputJsonValue } : {}),
  };
}

/**
 * End a job that has not ended yet: a stop from a screen, whether it was waiting or running.
 *
 * One that already ended is left as it is. Between reading a job and stopping it, it can
 * finish on its own, and "done" is not something a stop should overwrite.
 */
export async function finish(
  id: string,
  status: Ending,
  detail?: string,
  metrics?: JobMetrics,
): Promise<boolean> {
  const { count } = await prisma.job.updateMany({
    where: { id, status: { in: OPEN_STATUSES } },
    data: ending(status, detail, metrics),
  });
  return count > 0;
}

/**
 * Record how a run ended -- if nothing else decided while it was running.
 *
 * Two things can. A person stopping it: the stop routes end the job themselves, straight away,
 * and the run only finds out when its work comes back aborted. And a recording taking the card,
 * which puts the job back at the front of the queue to run again after the meeting. The run
 * used to report "cancelled" over either answer -- over the second one, badly: minutes a
 * recording interrupted were meant to come back once the meeting ended, and were marked
 * cancelled instead, so they never did.
 *
 * The figures from a run somebody stopped are still kept: the part that ran used the card.
 */
export async function finishRun(
  id: string,
  status: Ending,
  detail?: string,
  metrics?: JobMetrics,
): Promise<boolean> {
  const { count } = await prisma.job.updateMany({
    where: { id, status: "running" },
    data: ending(status, detail, metrics),
  });
  if (count === 0 && metrics) {
    await prisma.job.updateMany({
      where: { id, status: "cancelled" },
      data: { metrics: metrics as Prisma.InputJsonValue },
    });
  }
  return count > 0;
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
        ownerId: true,
        owner: { select: { username: true, name: true, image: true } },
        meeting: { select: { title: true } },
      },
    }),
  );

  return rows.map((j) => {
    const mine = viewerId !== null && j.ownerId === viewerId;
    const owner = j.owner;
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

/** Kinds whose runs are worth looking back on. Recording holds and key work are not. */
const HISTORY_KINDS = ["minutes", "diarize", "transcribe", "emotion"];

/**
 * Finished work, newest first, for the queue screen's history: how long each piece took, on
 * what, and whether the model fitted on the card.
 *
 * Narrower than the live queue on purpose. That one shows everybody's rows because "why has
 * mine not started" needs them; looking back needs only your own. An administrator also sees
 * everybody's, because the machine is theirs to tune — but as the live queue shows them: a kind,
 * a person and the figures, never which meeting, how long it was, or what went wrong with it.
 *
 * With no accounts at all, every job is the one person's.
 */
export async function recentJobsAcrossUsers(
  viewer: { id: string; isAdmin: boolean } | null,
  limit = 40,
) {
  const rows = await asSystem("the queue's history explains what the shared GPU did", () =>
    prisma.job.findMany({
      where: {
        status: { in: ["done", "error", "cancelled"] },
        kind: { in: HISTORY_KINDS },
        finishedAt: { not: null },
        // Somebody who is not an administrator sees their own and nothing else.
        ...(viewer && !viewer.isAdmin ? { ownerId: viewer.id } : {}),
      },
      orderBy: { finishedAt: "desc" },
      take: limit,
      select: {
        id: true,
        kind: true,
        status: true,
        detail: true,
        createdAt: true,
        startedAt: true,
        finishedAt: true,
        metrics: true,
        meetingId: true,
        ownerId: true,
        owner: { select: { username: true, name: true, image: true } },
        meeting: { select: { title: true, recordedMs: true, startedAt: true, endedAt: true } },
      },
    }),
  );

  return rows.map((j) => {
    const mine = viewer ? j.ownerId === viewer.id : j.ownerId === null;
    const m = j.meeting;
    const meetingMs =
      m?.recordedMs ?? (m?.endedAt && m.startedAt ? m.endedAt.getTime() - m.startedAt.getTime() : null);
    return {
      id: j.id,
      kind: j.kind,
      status: j.status,
      createdAt: j.createdAt,
      startedAt: j.startedAt,
      finishedAt: j.finishedAt,
      metrics: (j.metrics ?? null) as JobMetrics | null,
      mine,
      meetingId: mine ? j.meetingId : null,
      title: mine ? (m?.title ?? null) : null,
      meetingMs: mine ? meetingMs : null,
      detail: mine ? j.detail : null,
      owner: j.owner
        ? { username: j.owner.username, name: j.owner.name, hasImage: j.owner.image !== null }
        : null,
    };
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
