import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

// Restore a meeting from trash (set deletedAt back to null).
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await prisma.meeting.update({ where: { id }, data: { deletedAt: null } });
  } catch {
    return apiError("not found", 404);
  }
  return NextResponse.json({ ok: true });
}
