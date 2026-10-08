import { prisma } from "@/lib/prisma";

// What the sidebar lists (app/sidebar.tsx): the caller's meetings, newest first, with only what a
// row shows. Read by the root layout on every page, so it is one indexed query and a short take —
// the full list, with its filters, is still the list page.

export type SidebarMeeting = {
  id: string;
  title: string;
  /** When it was — or, for one booked and not recorded, when it is due. ISO. */
  at: string;
  /** Booked and not recorded yet. */
  upcoming: boolean;
  /** Being recorded: no end and something already said. */
  live: boolean;
  /** Recorded and ended, with lines but no minutes. */
  noMinutes: boolean;
};

export async function sidebarMeetings(): Promise<SidebarMeeting[]> {
  const rows = await prisma.meeting.findMany({
    where: { deletedAt: null, archivedAt: null },
    orderBy: { startedAt: "desc" },
    take: 80,
    select: {
      id: true,
      title: true,
      startedAt: true,
      endedAt: true,
      scheduledAt: true,
      _count: { select: { transcripts: true, summaries: true } },
    },
  });
  return rows.map((m) => {
    const upcoming = m.scheduledAt !== null && m.endedAt === null && m._count.transcripts === 0;
    return {
      id: m.id,
      title: m.title,
      at: (upcoming && m.scheduledAt ? m.scheduledAt : m.startedAt).toISOString(),
      upcoming,
      live: m.endedAt === null && !upcoming && m._count.transcripts > 0,
      noMinutes: m.endedAt !== null && m._count.transcripts > 0 && m._count.summaries === 0,
    };
  });
}
