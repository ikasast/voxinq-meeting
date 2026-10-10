import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { TRASH_PURGE_DAYS as PURGE_AFTER_DAYS, purgeExpiredTrash } from "@/lib/trash";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// List of trashed meetings. Also permanently deletes the reader's items older than 30 days
// (recordings too) — the hourly sweep in lib/trash.ts does the same for everybody, so opening the
// trash only makes sure what it lists is current.
export async function GET() {
  await purgeExpiredTrash();

  const meetings = await prisma.meeting.findMany({
    where: { deletedAt: { not: null } },
    orderBy: { deletedAt: "desc" },
    take: 200,
    include: {
      _count: { select: { transcripts: true, summaries: true } },
    },
  });

  return NextResponse.json({
    purgeAfterDays: PURGE_AFTER_DAYS,
    meetings: meetings.map((m) => ({
      id: m.id,
      title: m.title,
      deletedAt: m.deletedAt,
      startedAt: m.startedAt,
      transcriptCount: m._count.transcripts,
      summaryCount: m._count.summaries,
    })),
  });
}
