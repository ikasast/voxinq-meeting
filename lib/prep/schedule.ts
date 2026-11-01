import { asUser } from "@/lib/db/scope";
import { prisma } from "@/lib/prisma";
import { enqueue, openJobFor } from "@/lib/queue/queue";
import { RECORDING_KIND } from "@/lib/queue/types";

// When a recording with questions switched on gets its next update.
//
// The dispatcher calls this: it is the one thing that keeps running with no page open, which is
// the point. What it reads here is in the clear on purpose, because it runs for every account
// and has nobody's key: the switch, the two times, and how many lines there are, never their words.

/** How often a run happens during a recording. */
export const PREP_EVERY_MS = 5 * 60_000;
/** A pause is not worth a run. */
const MIN_NEW_LINES = 3;

export async function schedulePrep(): Promise<number> {
  const holds = await prisma.job.findMany({
    where: { kind: RECORDING_KIND, status: "running", meeting: { prepEnabled: true } },
    select: { meetingId: true, startedAt: true, meeting: { select: { ownerId: true } } },
  });
  let queued = 0;
  for (const { meetingId, startedAt, meeting } of holds) {
    if (!meetingId) continue;
    const row = await prisma.meetingPrep.findFirst({
      where: { meetingId },
      select: { ranAt: true, throughAt: true },
    });
    const since = row?.ranAt ?? startedAt;
    if (since && Date.now() - since.getTime() < PREP_EVERY_MS) continue;
    if (await openJobFor("prep", meetingId)) continue;
    const fresh = await prisma.transcript.count({
      where: { meetingId, ...(row?.throughAt ? { createdAt: { gt: row.throughAt } } : {}) },
    });
    if (fresh < MIN_NEW_LINES) continue;
    // As its owner: this runs as the system, and a job with no owner is one the meeting's own
    // page cannot see, so the panel would not say an update was under way.
    const owner = meeting?.ownerId;
    const job = () => enqueue({ kind: "prep", meetingId });
    await (owner ? asUser(owner, job) : job());
    queued += 1;
  }
  return queued;
}
