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
  /** Kept at the top of the sidebar. */
  pinned: boolean;
};

const SELECT = {
  id: true,
  title: true,
  startedAt: true,
  endedAt: true,
  scheduledAt: true,
  pinnedAt: true,
  _count: { select: { transcripts: true, summaries: true } },
} as const;

export async function sidebarMeetings(): Promise<SidebarMeeting[]> {
  // The recent ones, and the pinned ones however old: a pin is for the meeting that has fallen
  // out of the recent list.
  const [recent, pinned] = await Promise.all([
    prisma.meeting.findMany({
      where: { deletedAt: null, archivedAt: null },
      orderBy: { startedAt: "desc" },
      take: 80,
      select: SELECT,
    }),
    prisma.meeting.findMany({
      where: { deletedAt: null, archivedAt: null, pinnedAt: { not: null } },
      orderBy: { pinnedAt: "asc" },
      take: 40,
      select: SELECT,
    }),
  ]);
  const seen = new Set(recent.map((m) => m.id));
  const rows = [...recent, ...pinned.filter((m) => !seen.has(m.id))];
  return rows.map((m) => {
    const upcoming = m.scheduledAt !== null && m.endedAt === null && m._count.transcripts === 0;
    return {
      id: m.id,
      title: m.title,
      at: (upcoming && m.scheduledAt ? m.scheduledAt : m.startedAt).toISOString(),
      upcoming,
      live: m.endedAt === null && !upcoming && m._count.transcripts > 0,
      noMinutes: m.endedAt !== null && m._count.transcripts > 0 && m._count.summaries === 0,
      pinned: m.pinnedAt !== null,
    };
  });
}
