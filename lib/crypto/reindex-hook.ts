import { reindexMeeting } from "@/lib/crypto/index-meeting";
import { prismaRaw } from "@/lib/prisma-raw";

// Keeping the search index in step after something is written.
//
// Called from the handful of places that change what a meeting says: an utterance arriving
// during a recording, a transcript being replaced, minutes being written, an edit. Not from the
// Prisma extension — an index rebuild reads the whole meeting, and doing that inside the write
// that triggered it would turn one saved utterance into a re-read of the entire transcript.
//
// It never throws. A meeting that is momentarily missing from a search is a worse day than a
// meeting that failed to save, and the two should not be able to become the same failure.

export async function reindexAfterWrite(meetingId: string | null | undefined): Promise<void> {
  if (!meetingId) return;
  try {
    const m = await prismaRaw.meeting.findUnique({
      where: { id: meetingId },
      select: { ownerId: true },
    });
    await reindexMeeting(meetingId, m?.ownerId ?? null);
  } catch (e) {
    console.error("[search] could not reindex meeting", meetingId, e);
  }
}
