import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { extensionOff } from "@/app/api/extension-off";
import { clearTurns, turnsFor } from "@/lib/ask-history";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The questions asked where the Ask panel is opened, and their answers (lib/ask-history.ts):
// ?meetingId= on a meeting's page, ?seriesId= on a series page. The reader's own only — the
// database is scoped to them.

function scopeOf(req: NextRequest): { meetingId: string } | { seriesId: string } | null {
  const meetingId = req.nextUrl.searchParams.get("meetingId");
  const seriesId = req.nextUrl.searchParams.get("seriesId");
  if (meetingId) return { meetingId };
  if (seriesId) return { seriesId };
  return null;
}

export async function GET(req: NextRequest) {
  const off = await extensionOff("ask");
  if (off) return off;
  const where = scopeOf(req);
  if (!where) return apiError("seriesId or meetingId is required", 400);
  return NextResponse.json({ turns: await turnsFor(where) });
}

export async function DELETE(req: NextRequest) {
  const off = await extensionOff("ask");
  if (off) return off;
  const where = scopeOf(req);
  if (!where) return apiError("seriesId or meetingId is required", 400);
  return NextResponse.json({ cleared: await clearTurns(where) });
}
