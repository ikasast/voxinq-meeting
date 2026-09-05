import { hasPlaintext } from "@/lib/queue/runners/encrypt";
import { prismaRaw } from "@/lib/prisma-raw";

// Deciding whether an account still has anything to encrypt.
//
// Asked at every sign-in and answered with two counts, which is cheap and — more usefully —
// self-correcting: a migration interrupted by a restart, a power cut or somebody closing the
// laptop simply finds work left to do the next time they sign in, and picks it up.

export async function enqueueEncryptionIfNeeded(ownerId: string): Promise<boolean> {
  // One at a time. Signing in on a phone and a laptop within the same minute should not queue
  // the same walk over the same rows twice.
  const already = await prismaRaw.job.findFirst({
    where: { kind: "encrypt", ownerId, status: { in: ["queued", "running"] } },
    select: { id: true },
  });
  if (already) return false;

  if (!(await hasPlaintext(ownerId))) return false;

  await prismaRaw.job.create({
    data: {
      kind: "encrypt",
      ownerId,
      status: "queued",
      // No video memory: this is a walk over rows, and making it wait for the GPU would put it
      // behind exactly the work it is meant to finish before.
      vramMb: 0,
      params: "{}",
      detail: "Encrypting the meetings recorded before this account had a key.",
    },
  });
  return true;
}
