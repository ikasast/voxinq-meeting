import { encryptField, isEncrypted } from "@/lib/crypto/field";
import { keyFor } from "@/lib/crypto/key-cache";
import { reindexMeeting } from "@/lib/crypto/index-meeting";
import { prismaRaw } from "@/lib/prisma-raw";

// Encrypting what was already there.
//
// Everything an account recorded before it had a key is in the clear. This walks it once and
// puts it behind the key — as a queued job rather than as part of signing in, because somebody
// with two years of meetings should not watch a login spinner while a hundred thousand rows are
// rewritten, and because the queue already knows how to show progress, survive a restart and
// hold the key for exactly as long as the work lasts.
//
// It is idempotent by construction: it only touches rows that are not encrypted yet, so running
// it twice, or resuming it after a crash, costs a query and changes nothing.

const BATCH = 500;

export async function runEncryptExisting(
  job: { meetingId: string | null; params: string },
  signal?: AbortSignal,
  ownerId?: string,
) {
  if (!ownerId) throw new Error("nothing to encrypt without an owner");
  const master = await keyFor(ownerId);
  // The dispatcher will not start this without the key, so reaching here without one means
  // something else has gone wrong and writing plaintext would be the worst possible answer.
  if (!master) throw new Error("the key is not available");

  let transcripts = 0;
  let minutes = 0;

  for (;;) {
    if (signal?.aborted) break;
    const rows = await prismaRaw.transcript.findMany({
      where: { meeting: { ownerId }, NOT: { text: { startsWith: "enc:v1." } } },
      select: { id: true, text: true },
      take: BATCH,
    });
    if (rows.length === 0) break;
    await prismaRaw.$transaction(
      rows
        .filter((r) => !isEncrypted(r.text))
        .map((r) =>
          prismaRaw.transcript.update({
            where: { id: r.id },
            data: { text: encryptField(r.text, master, "transcript") },
          }),
        ),
    );
    transcripts += rows.length;
  }

  for (;;) {
    if (signal?.aborted) break;
    const rows = await prismaRaw.meetingSummary.findMany({
      where: { meeting: { ownerId }, NOT: { summaryText: { startsWith: "enc:v1." } } },
      select: { id: true, summaryText: true },
      take: BATCH,
    });
    if (rows.length === 0) break;
    await prismaRaw.$transaction(
      rows
        .filter((r) => !isEncrypted(r.summaryText))
        .map((r) =>
          prismaRaw.meetingSummary.update({
            where: { id: r.id },
            data: { summaryText: encryptField(r.summaryText, master, "minutes") },
          }),
        ),
    );
    minutes += rows.length;
  }

  // The index is built from the same walk. It has to be: an account whose meetings were
  // encrypted but never indexed is one whose search silently stops finding anything it used to.
  let indexed = 0;
  const meetings = await prismaRaw.meeting.findMany({
    where: { ownerId },
    select: { id: true },
  });
  for (const m of meetings) {
    if (signal?.aborted) break;
    await reindexMeeting(m.id, ownerId);
    indexed++;
  }

  return {
    note:
      transcripts + minutes + indexed === 0
        ? undefined
        : `Encrypted ${transcripts} utterance(s) and ${minutes} set(s) of minutes, and indexed ${indexed} meeting(s) for search.`,
  };
}

/**
 * Is there work to do for this person? Asked at sign-in.
 *
 * Two reasons, not one. Something still in the clear is the obvious case. The other is a meeting
 * with no search index — which is what every account looked like the moment indexing was added,
 * because their meetings were already encrypted and so nothing would have queued a job for them.
 * Their search would simply have stopped finding anything, with nothing to say why.
 */
export async function needsEncryptionPass(ownerId: string): Promise<boolean> {
  const [plainText, plainMinutes, unindexed] = await Promise.all([
    prismaRaw.transcript.count({
      where: { meeting: { ownerId }, NOT: { text: { startsWith: "enc:v1." } } },
    }),
    prismaRaw.meetingSummary.count({
      where: { meeting: { ownerId }, NOT: { summaryText: { startsWith: "enc:v1." } } },
    }),
    prismaRaw.meeting.count({ where: { ownerId, grams: { none: {} } } }),
  ]);
  return plainText + plainMinutes + unindexed > 0;
}
