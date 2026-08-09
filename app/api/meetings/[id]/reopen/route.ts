import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

// Reopen an ended meeting so a new recording session can be appended to it (Resume recording).
// Clears endedAt; the existing transcript, minutes and recording are kept. Ending again later
// re-sets endedAt (and the recorded length). External callers are blocked by proxy.ts.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const m = await prisma.meeting.update({ where: { id }, data: { endedAt: null } });
    return NextResponse.json(m);
  } catch {
    return apiError("not found", 404);
  }
}
