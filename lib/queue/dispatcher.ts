import { budgetMb } from "./capacity";
import { dropIdleKeys } from "@/lib/crypto/key-cache";
import { asSystem, asUser } from "@/lib/db/scope";
import { prismaRaw } from "@/lib/prisma-raw";
import { sweepStaleRecordings } from "./recording";
import { claimNext, finish, recoverInterrupted } from "./queue";
import { runDiarize } from "./runners/diarize";
import { runMinutes } from "./runners/minutes";
import { runTranscribe } from "./runners/transcribe";

// The one thing that decides what runs.
//
// It lives in the web app rather than beside the work because the web app is the only component
// that can see all of it: the database, the STT service and the LLM. A third process would have
// to be installed, supervised and packaged, against a project whose install is one
// `docker compose up`.
//
// It is a loop rather than a trigger on the enqueue path so that a job left queued by a crash,
// a restart, or a run that ended without freeing its slot is picked up anyway. Nothing has to
// remember to kick it.

const TICK_MS = 2000;

let timer: ReturnType<typeof setInterval> | null = null;
let ticking = false;

/** The sweep is a round trip to the STT service; a stale hold is not urgent enough to ask
 * about every couple of seconds. */
const SWEEP_MS = 30_000;
let lastSweep = 0;
/** Ids this process is running. The row says `running` too; this is what `finally` needs. */
const inFlight = new Set<string>();
/**
 * One controller per running job, so a cancel can stop the waiting.
 *
 * Aborting stops this side watching; whether the work itself stops depends on the work.
 * Diarization can be stopped on the STT service, minutes generation mid-stream. A recognition
 * pass runs to its end and its result is discarded — better than a cancel button that lies.
 */
const signals = new Map<string, AbortController>();

/** Stop watching a running job. Returns false if it is not running here. */
export function abortJob(id: string): boolean {
  const ac = signals.get(id);
  if (!ac) return false;
  ac.abort();
  return true;
}

export function isRunning(): boolean {
  return timer !== null;
}

export async function startDispatcher(): Promise<void> {
  if (timer) return;
  const recovered = await asSystem("restart recovery spans every account's queue", () =>
    recoverInterrupted(),
  ).catch((e) => {
    // A database that is not up yet is the normal case at boot; the tick will retry.
    console.error("[queue] could not recover interrupted jobs", e);
    return 0;
  });
  if (recovered > 0) console.log(`[queue] ${recovered} interrupted job(s) put back in the queue`);
  timer = setInterval(() => void tick(), TICK_MS);
  void tick();
}

export function stopDispatcher(): void {
  if (timer) clearInterval(timer);
  timer = null;
}

/**
 * One pass: take a job if there is room, start it, return.
 *
 * The run is deliberately not awaited — a tick that waited for minutes generation would hold
 * the loop for the length of it, and the point of the loop is to keep looking. `ticking` guards
 * only the claim, which is the part that must not interleave with itself.
 */
export async function tick(): Promise<void> {
  if (ticking) return;
  ticking = true;
  try {
    // The scheduler looks at everybody's queue, and has to: it is the thing deciding what the
    // one GPU does next, and it cannot do that seeing a third of the work. It only ever reads
    // which job is next and marks it running — the job itself then runs as whoever owns it.
    await asSystem("the queue scheduler arbitrates one GPU across every account", async () => {
    // Before choosing what fits: a hold left behind by a browser that went away makes the card
    // look full forever, and nothing else in the loop would ever notice.
    if (Date.now() - lastSweep > SWEEP_MS) {
      lastSweep = Date.now();
      const freed = await sweepStaleRecordings().catch(() => 0);
      if (freed > 0) console.log(`[queue] released ${freed} recording hold(s) nobody was using`);
    }
      // Whoever still has work keeps their key; everybody else loses theirs now. This is what
      // bounds how long a key is in memory at all — on an instance where nobody is working, the
      // cache is empty rather than holding whatever was last used.
      await releaseIdleKeys();

      const job = await claimNext(await budgetMb());
      if (!job) return;
      // Keep going: what was just started may leave room for the next one — a remote
      // recognition costs nothing here, and used to wait behind hardware it never touched.
      setTimeout(() => void tick(), 50);
      inFlight.add(job.id);
      signals.set(job.id, new AbortController());
      // Whose job it is, so its reads and writes are scoped like anything that person does.
      // A job with no owner is from before this instance had accounts and runs unscoped.
      const owner = job.meetingId ? await ownerOf(job.meetingId) : null;
      const running = owner
        ? asUser(owner, () => run(job))
        : asSystem("a job from before this instance had accounts", () => run(job));
      void running.finally(() => {
        inFlight.delete(job.id);
        signals.delete(job.id);
      });
    });
  } catch (e) {
    console.error("[queue] tick failed", e);
  } finally {
    ticking = false;
  }
}

/** The owner of the meeting a job belongs to. Read unscoped, because this *is* the scoping. */
async function ownerOf(meetingId: string): Promise<string | null> {
  const m = await prismaRaw.meeting.findUnique({
    where: { id: meetingId },
    select: { ownerId: true },
  });
  return m?.ownerId ?? null;
}

async function run(job: { id: string; kind: string; meetingId: string | null; params: string }) {
  try {
    switch (job.kind) {
      case "minutes": {
        const r = await runMinutes(job);
        // An abort is not a failure of the job: it was stopped on purpose, and the meeting
        // already carries the reason. It does not go back in the queue on its own — whoever
        // stopped it decides whether it should run again.
        await finish(job.id, r.aborted ? "cancelled" : r.reason ? "error" : "done", r.reason);
        return;
      }
      case "transcribe": {
        const r = await runTranscribe(job, signals.get(job.id)?.signal);
        await finish(job.id, "done", r.note);
        return;
      }
      case "diarize": {
        const r = await runDiarize(job, signals.get(job.id)?.signal);
        await finish(job.id, "done", r.note);
        return;
      }
      default:
        // A kind this build does not know. Failing it is better than leaving it queued
        // forever, where it would sit at the front and block everything behind it.
        await finish(job.id, "error", `unknown job kind: ${job.kind}`);
    }
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    console.error(`[queue] ${job.kind} failed`, e);
    await finish(job.id, "error", reason).catch(() => {});
  }
}

/**
 * Forget the keys of everybody whose queue has emptied.
 *
 * A key is in this process only because work outlives the browser that asked for it. The moment
 * there is no such work for somebody, there is no reason to still be holding theirs — so the
 * lifetime is the queue's, not the session's.
 */
async function releaseIdleKeys(): Promise<void> {
  const open = await prismaRaw.job.findMany({
    where: { status: { in: ["queued", "running"] } },
    select: { meeting: { select: { ownerId: true } } },
  });
  const busy = new Set<string>();
  for (const j of open) if (j.meeting?.ownerId) busy.add(j.meeting.ownerId);
  const dropped = dropIdleKeys(busy);
  if (dropped > 0) console.log(`[queue] released ${dropped} key(s) whose work is finished`);
}
