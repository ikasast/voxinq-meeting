import { keyFor } from "@/lib/crypto/key-cache";
import { decryptField, isEncrypted } from "@/lib/crypto/field";
import { fieldSubkey } from "@/lib/crypto/keys";
import { tokensFor } from "@/lib/crypto/gram";
import { prismaRaw } from "@/lib/prisma-raw";

// Keeping a meeting's search index in step with what it says.
//
// Unscoped on purpose: it reads the ciphertext, decrypts it with the owner's key and writes
// tokens back. Going through the scoped client would decrypt on the way in and re-encrypt on
// the way out, which is exactly what this must not do.

/** Everything a meeting contains, as one string, for indexing. */
async function textOf(meetingId: string, master: Buffer): Promise<string> {
  const [rows, summaries, meeting] = await Promise.all([
    prismaRaw.transcript.findMany({ where: { meetingId }, select: { text: true } }),
    prismaRaw.meetingSummary.findMany({ where: { meetingId }, select: { summaryText: true } }),
    prismaRaw.meeting.findUnique({
      where: { id: meetingId },
      select: { title: true, description: true },
    }),
  ]);
  const read = (v: string) => (isEncrypted(v) ? (decryptField(v, master) ?? "") : v);
  return [
    // The title and description are not encrypted, but they belong in the index anyway: one
    // search box should not quietly search two different sets of things.
    meeting?.title ?? "",
    meeting?.description ?? "",
    ...rows.map((r) => read(r.text)),
    ...summaries.map((s) => read(s.summaryText)),
  ].join("\n");
}

/**
 * Rebuild one meeting's index.
 *
 * Whole rather than incremental. An utterance can be edited or deleted, and a token that should
 * have gone stays behind for ever if the index is only ever added to — leaving a meeting
 * findable by a word somebody removed from it, which is the one failure a search index must not
 * have.
 */
export async function reindexMeeting(meetingId: string, ownerId: string | null): Promise<number> {
  if (!ownerId) return 0;
  const master = await keyFor(ownerId);
  // No key means the content cannot be read, so the index cannot be rebuilt. Leaving what is
  // there is right: it is still correct, just not up to date, and the next reindex with a key
  // fixes it.
  if (!master) return 0;

  const tokens = tokensFor(await textOf(meetingId, master), fieldSubkey(master, "index"));
  await prismaRaw.$transaction([
    prismaRaw.meetingGram.deleteMany({ where: { meetingId } }),
    prismaRaw.meetingGram.createMany({
      data: tokens.map((token) => ({ meetingId, token })),
      skipDuplicates: true,
    }),
  ]);
  return tokens.length;
}

/** The tokens a search should look for, or null when the index cannot help. */
export async function searchTokens(query: string, ownerId: string): Promise<string[] | null> {
  const master = await keyFor(ownerId);
  if (!master) return null;
  const { queryTokens } = await import("@/lib/crypto/gram");
  return queryTokens(query, fieldSubkey(master, "index"));
}
