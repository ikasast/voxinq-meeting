import { encryptField, isEncrypted } from "@/lib/crypto/field";
import { keyFor } from "@/lib/crypto/key-cache";
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

  return {
    note:
      transcripts + minutes === 0
        ? undefined
        : `Encrypted ${transcripts} utterance(s) and ${minutes} set(s) of minutes.`,
  };
}

/** Is there anything left in the clear for this person? Asked at sign-in. */
export async function hasPlaintext(ownerId: string): Promise<boolean> {
  const [t, m] = await Promise.all([
    prismaRaw.transcript.count({
      where: { meeting: { ownerId }, NOT: { text: { startsWith: "enc:v1." } } },
    }),
    prismaRaw.meetingSummary.count({
      where: { meeting: { ownerId }, NOT: { summaryText: { startsWith: "enc:v1." } } },
    }),
  ]);
  return t + m > 0;
}
