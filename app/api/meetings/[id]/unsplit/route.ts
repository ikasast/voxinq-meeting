import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { undoSplits } from "@/lib/meetings/split";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

// Put lines that diarization divided at a speaker change back together.
//
// The way out of a split that got it wrong. Each line that came out of another is appended to
// it and removed. A meeting with nothing split answers 0 rather than failing, so pressing this
// twice is harmless.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Somebody else's meeting is not found, as on every other route. Without this the scoped
  // query found no lines and answered "nothing to undo" — harmless, and still an answer about a
  // meeting the caller cannot see.
  const meeting = await prisma.meeting.findUnique({ where: { id }, select: { id: true } });
  if (!meeting) return apiError("meeting not found", 404);
  try {
    return NextResponse.json(await undoSplits(id));
  } catch (e) {
    return apiError((e as Error).message || "could not undo the split", 500);
  }
}
