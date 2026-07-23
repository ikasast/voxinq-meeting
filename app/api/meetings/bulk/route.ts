import { NextRequest, NextResponse } from "next/server";
import { apiError, readJson } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const ACTIONS = ["archive", "unarchive", "trash"] as const;
type Action = (typeof ACTIONS)[number];

// Apply one action to several meetings at once. Used by the swipe gestures on the
// meeting list: a single card passes one id, a collapsed series stack passes every
// meeting in that series.
export async function POST(req: NextRequest) {
  const body = await readJson<{ ids?: unknown; action?: unknown }>(req);

  const action = typeof body?.action === "string" ? body.action : "";
  if (!(ACTIONS as readonly string[]).includes(action)) return apiError("invalid action", 400);

  if (
    !Array.isArray(body?.ids) ||
    body.ids.length === 0 ||
    body.ids.length > 200 ||
    !body.ids.every((id) => typeof id === "string" && id.length > 0 && id.length <= 64)
  ) {
    return apiError("invalid ids", 400);
  }
  const ids = [...new Set(body.ids as string[])];

  const data =
    (action as Action) === "trash"
      ? { deletedAt: new Date() }
      : { archivedAt: action === "archive" ? new Date() : null };

  // Never resurrect trashed meetings via archive/unarchive.
  const result = await prisma.meeting.updateMany({
    where: { id: { in: ids }, deletedAt: null },
    data,
  });

  return NextResponse.json({ ok: true, updated: result.count });
}
