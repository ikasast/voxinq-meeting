import { asSystem } from "./db/scope";
import { prisma } from "./prisma";
import { sttInternalUrl } from "./stt/internal";

// How long a meeting stays in the trash, and the emptying of it.
//
// Read by the trash itself (app/api/trash), by the storage page, which says when the room a
// trashed recording takes will come back, and by the sweep below.

export const TRASH_PURGE_DAYS = 30;

/**
 * Delete a meeting's recording (the WAV and everything kept beside it) on the STT service.
 *
 * The internal address, not the browser's: in Docker the browser's is the web container's own
 * localhost, where nothing listens — which is how deleting a meeting for good used to leave its
 * recording behind. True when the service answered; it answers yes for a meeting with no
 * recording too.
 */
export async function deleteRecording(id: string): Promise<boolean> {
  try {
    const res = await fetch(`${sttInternalUrl()}/recordings/${encodeURIComponent(id)}`, {
      method: "DELETE",
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Delete for good what has been in the trash longer than TRASH_PURGE_DAYS. Returns how many
 * meetings went.
 *
 * The recording first, and the meeting only once it is gone: deleting the row is what makes the
 * recording unfindable, so a row deleted while the STT service was away would leave its audio on
 * disk for ever, with nothing left to point at it. "Could not ask" waits for the next pass.
 *
 * Scoped like everything else: from the trash screen it empties the reader's own; the sweep runs
 * it for everybody.
 */
export async function purgeExpiredTrash(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - TRASH_PURGE_DAYS * 86_400_000);
  const expired = await prisma.meeting.findMany({
    where: { deletedAt: { lt: cutoff } },
    select: { id: true },
  });
  if (expired.length === 0) return 0;
  const gone: string[] = [];
  for (const { id } of expired) {
    if (await deleteRecording(id)) gone.push(id);
  }
  if (gone.length === 0) return 0;
  const { count } = await prisma.meeting.deleteMany({ where: { id: { in: gone } } });
  return count;
}

const SWEEP_MS = 60 * 60_000;
let sweep: ReturnType<typeof setInterval> | null = null;

/**
 * Empty the trash on a timer as well as when it is opened.
 *
 * It used to happen only when somebody opened the trash, so a meeting nobody went looking for
 * there kept its recording — and the storage page's "deleted 30 days after" — indefinitely.
 * Hourly, and once shortly after start; a pass that fails is simply the next one's work.
 */
export function startTrashSweep(): void {
  if (sweep) return;
  const run = () =>
    void asSystem("the trash is emptied on one schedule for every account", () => purgeExpiredTrash())
      .then((n) => {
        if (n > 0) console.log(`[trash] deleted ${n} meeting(s) kept in the trash for ${TRASH_PURGE_DAYS} days`);
      })
      .catch((e) => console.error("[trash] could not empty the trash", e));
  sweep = setInterval(run, SWEEP_MS);
  setTimeout(run, 60_000);
}
