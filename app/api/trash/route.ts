import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sttHttpBase } from "@/lib/stt/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PURGE_AFTER_DAYS = 30;

// List of trashed meetings. Also permanently deletes items older than 30 days (recordings too).
export async function GET() {
  const cutoff = new Date(Date.now() - PURGE_AFTER_DAYS * 86400_000);
  const expired = await prisma.meeting.findMany({
    where: { deletedAt: { lt: cutoff } },
    select: { id: true },
  });
  if (expired.length > 0) {
    await prisma.meeting.deleteMany({ where: { id: { in: expired.map((m) => m.id) } } });
    // Clean up recordings too (best-effort).
    for (const m of expired) {
      fetch(`${sttHttpBase()}/recordings/${m.id}`, {
        method: "DELETE",
        signal: AbortSignal.timeout(4000),
      }).catch(() => {});
    }
  }

  const meetings = await prisma.meeting.findMany({
    where: { deletedAt: { not: null } },
    orderBy: { deletedAt: "desc" },
    take: 200,
    include: {
      _count: { select: { transcripts: true, summaries: true } },
      tags: { select: { name: true }, orderBy: { name: "asc" } },
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
      tags: m.tags.map((t) => t.name),
    })),
  });
}
