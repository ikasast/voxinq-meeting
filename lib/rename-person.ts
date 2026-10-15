import { prisma } from "@/lib/prisma";
import { readNames } from "@/lib/speakers";

// Renaming somebody everywhere they are named: their voiceprint, the speakers of the meetings they
// were recognised in, the participants of the meetings they were at, and the regular members of
// the series they belong to.
//
// One person's own data only — the client is scoped (lib/prisma.ts). The minutes are not touched:
// they are prose the model wrote, and rewriting a name inside them is a regeneration.

export type RenameCounts = { meetings: number; participants: number; members: number };

/**
 * What a rename would change, or (with `apply`) changes it. A participant or member already
 * listed under the new name is the same person twice once renamed, so the old row is dropped
 * rather than renamed into a duplicate.
 */
export async function renamePerson(from: string, to: string, apply: boolean): Promise<RenameCounts> {
  // Speakers: a map of voice → name on the meeting, so the rows that mention the name are read
  // and the ones that really name somebody `from` are changed.
  const candidates = await prisma.meeting.findMany({
    where: { speakerLabels: { contains: JSON.stringify(from).slice(1, -1) } },
    select: { id: true, speakerLabels: true },
  });
  const meetings = candidates.filter((m) => Object.values(readNames(m.speakerLabels)).includes(from));

  const participants = await prisma.meetingParticipant.findMany({
    where: { name: from },
    select: { id: true, meetingId: true },
  });
  const members = await prisma.seriesMember.findMany({
    where: { name: from },
    select: { id: true, seriesId: true },
  });

  if (apply) {
    for (const m of meetings) {
      const names = readNames(m.speakerLabels);
      for (const k of Object.keys(names)) if (names[k] === from) names[k] = to;
      await prisma.meeting.update({ where: { id: m.id }, data: { speakerLabels: JSON.stringify(names) } });
    }
    for (const p of participants) {
      const taken = await prisma.meetingParticipant.findFirst({ where: { meetingId: p.meetingId, name: to } });
      if (taken) await prisma.meetingParticipant.delete({ where: { id: p.id } });
      else await prisma.meetingParticipant.update({ where: { id: p.id }, data: { name: to } });
    }
    for (const s of members) {
      const taken = await prisma.seriesMember.findFirst({ where: { seriesId: s.seriesId, name: to } });
      if (taken) await prisma.seriesMember.delete({ where: { id: s.id } });
      else await prisma.seriesMember.update({ where: { id: s.id }, data: { name: to } });
    }
  }

  return {
    meetings: new Set([...meetings.map((m) => m.id), ...participants.map((p) => p.meetingId)]).size,
    participants: participants.length,
    members: members.length,
  };
}
