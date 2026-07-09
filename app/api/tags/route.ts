import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

// List of existing tags (by name). Used for suggestions in the tag-edit UI and list filtering.
// Returns only tags actually used by non-trashed meetings.
// (Orphan tags attached to no meeting, or tags left only on trashed meetings, are not suggested.)
export async function GET() {
  const tags = await prisma.tag.findMany({
    where: { meetings: { some: { deletedAt: null } } },
    orderBy: { name: "asc" },
    include: { _count: { select: { meetings: true } } },
  });
  return NextResponse.json(
    tags.map((t) => ({ id: t.id, name: t.name, meetingCount: t._count.meetings })),
  );
}
