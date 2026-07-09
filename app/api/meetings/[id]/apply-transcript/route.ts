import { NextRequest, NextResponse } from "next/server";
import { apiError, readJson } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { SELF_KEY } from "@/lib/speakers";

export const runtime = "nodejs";

// Replace the whole transcript with the re-transcription results.
// createdAt is reconstructed as "meeting start time + utterance start seconds" to approximate the real time
// (the trailing +index ms stabilizes ordering for same-time ties).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await readJson<{ utterances?: unknown }>(req);

  if (!Array.isArray(body?.utterances)) return apiError("utterances is required", 400);
  const utterances: { start: number; text: string }[] = [];
  for (const u of body.utterances) {
    if (!u || typeof u !== "object") return apiError("invalid utterances", 400);
    const { start, text } = u as { start?: unknown; text?: unknown };
    if (typeof text !== "string" || !text.trim()) continue;
    utterances.push({ start: typeof start === "number" && start >= 0 ? start : 0, text: text.trim() });
  }
  if (utterances.length === 0) return apiError("no utterances", 400);

  const meeting = await prisma.meeting.findUnique({
    where: { id },
    select: { id: true, startedAt: true },
  });
  if (!meeting) return apiError("not found", 404);

  const base = meeting.startedAt.getTime();
  await prisma.$transaction([
    prisma.transcript.deleteMany({ where: { meetingId: id } }),
    prisma.transcript.createMany({
      data: utterances.map((u, i) => ({
        meetingId: id,
        speakerType: SELF_KEY,
        text: u.text,
        createdAt: new Date(base + Math.round(u.start * 1000) + i),
      })),
    }),
  ]);

  const transcripts = await prisma.transcript.findMany({
    where: { meetingId: id },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ replaced: transcripts.length, transcripts });
}
