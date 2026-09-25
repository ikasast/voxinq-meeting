import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * How long after its time a meeting is still worth mentioning.
 *
 * Without a floor, opening the app after a fortnight away announces every meeting anybody
 * booked and did not record, which is not a reminder — it is a list of regrets. Two hours is
 * about as late as "your meeting is starting" is still true.
 */
const STALE_AFTER_MS = 2 * 60 * 60 * 1000;

/**
 * The meetings whose time has come.
 *
 * Booked, not recorded, and due. A meeting stops being due the moment it has a transcript or an
 * end time, so acting on the reminder is what clears it — there is no "seen" flag on the server
 * and nothing to get out of step with what actually happened.
 *
 * Read by a poller on every page, so it is deliberately cheap: an indexed range on
 * `scheduledAt`, no joins, and at most a handful of rows.
 *
 * With `?soon=<minutes>` it also answers what is *coming*, for a caller that cannot poll every
 * thirty seconds — the Android app, which sets a notice for each booked meeting's own time.
 */
export async function GET(req: NextRequest) {
  const now = Date.now();
  // How far ahead to also report, in minutes. Absent — which is every browser — adds nothing.
  const soonMinutes = Number(req.nextUrl.searchParams.get("soon") ?? 0);
  const rows = await prisma.meeting.findMany({
    where: {
      deletedAt: null,
      endedAt: null,
      scheduledAt: { lte: new Date(now), gte: new Date(now - STALE_AFTER_MS) },
      transcripts: { none: {} },
    },
    orderBy: { scheduledAt: "asc" },
    take: 5,
    select: { id: true, title: true, scheduledAt: true },
  });

  const soon =
    Number.isFinite(soonMinutes) && soonMinutes > 0
      ? await prisma.meeting.findMany({
          where: {
            deletedAt: null,
            endedAt: null,
            scheduledAt: {
              gt: new Date(now),
              lte: new Date(now + Math.min(soonMinutes, 7 * 24 * 60) * 60_000),
            },
            transcripts: { none: {} },
          },
          orderBy: { scheduledAt: "asc" },
          take: 50,
          select: { id: true, title: true, scheduledAt: true },
        })
      : [];

  const shape = (m: { id: string; title: string; scheduledAt: Date | null }) => ({
    id: m.id,
    title: m.title,
    scheduledAt: m.scheduledAt?.toISOString() ?? null,
  });

  return NextResponse.json({ meetings: rows.map(shape), soon: soon.map(shape) });
}
