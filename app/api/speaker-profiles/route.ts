import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Enrolled voice profiles (voiceprints). Enrollment happens per meeting via
// POST /api/meetings/[id]/save-voice-profiles; this endpoint lists and deletes them.
export async function GET() {
  const profiles = await prisma.speakerProfile.findMany({
    select: { name: true, sourceMeetingId: true, updatedAt: true },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(profiles);
}

export async function DELETE(req: NextRequest) {
  const name = new URL(req.url).searchParams.get("name")?.trim();
  if (!name) return apiError("name is required", 400);
  try {
    await prisma.speakerProfile.delete({ where: { name } });
  } catch {
    return apiError("not found", 404);
  }
  return NextResponse.json({ ok: true });
}
