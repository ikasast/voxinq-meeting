import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

// Mark a meeting as ended (set endedAt). Called from the recording screen's end action.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const ended = await prisma.meeting.update({
      where: { id },
      data: { endedAt: new Date() },
    });
    return NextResponse.json(ended);
  } catch {
    return apiError("not found", 404);
  }
}
