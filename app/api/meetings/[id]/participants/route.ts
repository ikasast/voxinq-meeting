import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NAME_MAX = 80;
const MAX_PARTICIPANTS = 50;

// Who was in a meeting, and which of them are expected in the audio.
//
// The list is written whole rather than one row at a time: it is edited as a list, the order is
// the order it was typed in, and replacing it is the only operation that cannot leave the
// positions inconsistent with what the person is looking at.

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rows = await prisma.meetingParticipant.findMany({
    where: { meetingId: id },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    select: { name: true, speaking: true },
  });
  return NextResponse.json({ participants: rows });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const body = (await req.json().catch(() => null)) as {
    participants?: { name?: unknown; speaking?: unknown }[];
  } | null;
  if (!Array.isArray(body?.participants)) return apiError("participants must be an array", 400);
  if (body.participants.length > MAX_PARTICIPANTS) {
    return apiError(`at most ${MAX_PARTICIPANTS} participants`, 400);
  }

  // Trim, drop blanks, and collapse duplicates keeping the first — the table has a unique
  // constraint on (meeting, name), and a list typed by hand is where a repeat comes from.
  const seen = new Set<string>();
  const clean: { name: string; speaking: boolean; position: number }[] = [];
  for (const raw of body.participants) {
    const name = typeof raw?.name === "string" ? raw.name.trim().slice(0, NAME_MAX) : "";
    if (!name || seen.has(name)) continue;
    seen.add(name);
    clean.push({ name, speaking: raw?.speaking !== false, position: clean.length });
  }

  const meeting = await prisma.meeting.findUnique({ where: { id }, select: { id: true } });
  if (!meeting) return apiError("not found", 404);

  await prisma.$transaction([
    prisma.meetingParticipant.deleteMany({ where: { meetingId: id } }),
    ...(clean.length > 0
      ? [prisma.meetingParticipant.createMany({ data: clean.map((p) => ({ ...p, meetingId: id })) })]
      : []),
  ]);

  return NextResponse.json({
    participants: clean.map(({ name, speaking }) => ({ name, speaking })),
  });
}
