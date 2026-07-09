import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

// Manually edit the text of a generated minutes (so LLM errors can be fixed before sharing).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { summaryText?: unknown } | null;
  const text = typeof body?.summaryText === "string" ? body.summaryText.trim() : "";
  if (!text) {
    return NextResponse.json({ error: "summaryText is required" }, { status: 400 });
  }

  const exists = await prisma.meetingSummary.findUnique({ where: { id }, select: { id: true } });
  if (!exists) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const updated = await prisma.meetingSummary.update({
    where: { id },
    data: { summaryText: text },
    select: { id: true },
  });
  return NextResponse.json(updated);
}
