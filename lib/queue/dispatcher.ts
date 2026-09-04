import { claimNext, finish, recoverInterrupted } from "./queue";
import { runMinutes } from "./runners/minutes";

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
/** Ids this process is running. The row says `running` too; this is what `finally` needs. */
const inFlight = new Set<string>();

export function isRunning(): boolean {
  return timer !== null;
}

export async function startDispatcher(): Promise<void> {
  if (timer) return;
  const recovered = await recoverInterrupted().catch((e) => {
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
    const job = await claimNext();
    if (!job) return;
    inFlight.add(job.id);
    void run(job).finally(() => inFlight.delete(job.id));
  } catch (e) {
    console.error("[queue] tick failed", e);
  } finally {
    ticking = false;
  }
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
