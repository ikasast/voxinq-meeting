import { NextRequest, NextResponse } from "next/server";
import { extensionOff } from "@/app/api/extension-off";
import { apiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

// Delete one piece of meeting feedback. Scoped like everything else of the meeting's: somebody
// else's is not found.
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const off = await extensionOff("review");
  if (off) return off;
  const { id } = await ctx.params;
  const { count } = await prisma.meetingReview.deleteMany({ where: { id } });
  if (count === 0) return apiError("not found", 404);
  return NextResponse.json({ ok: true });
}
