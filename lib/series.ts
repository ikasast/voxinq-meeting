import { prisma } from "./prisma";

/**
 * Give a meeting the series' regular members, unless it already has people.
 *
 * Copied rather than referenced: who was in the room on a given day is a fact about that day,
 * and somebody leaving the project must not rewrite the record of the meetings they did attend.
 *
 * "Unless it already has people" is what makes this safe to call from more than one place — a
 * meeting created with a series and then re-filed under another one keeps the list somebody
 * has since edited, rather than having it replaced underneath them.
 */
export async function applySeriesMembers(meetingId: string, seriesId: string): Promise<void> {
  try {
    const existing = await prisma.meetingParticipant.count({ where: { meetingId } });
    if (existing > 0) return;
    const members = await prisma.seriesMember.findMany({
      where: { seriesId },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      select: { name: true },
    });
    if (members.length === 0) return;
    await prisma.meetingParticipant.createMany({
      data: members.map((m, position) => ({
        meetingId,
        name: m.name,
        // Every regular member is expected to speak; unticking one is a per-meeting fact.
        speaking: true,
        position,
      })),
    });
  } catch {
    // Best effort, like the pruning below: a meeting with no participants is a meeting
    // somebody can fill in, and failing to create one would be worse than an empty list.
  }
}

/**
 * Delete series no longer attached to any meeting (orphan cleanup).
 * Call after reassigning or deleting a meeting. Failures do not block the main flow.
 */
export async function pruneOrphanSeries(): Promise<void> {
  try {
    await prisma.series.deleteMany({ where: { meetings: { none: {} } } });
  } catch {
    // cleanup is best-effort, so swallow errors
  }
}
