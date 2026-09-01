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
  const body = await readJson<{ utterances?: unknown; usedModel?: unknown }>(req);

  if (!Array.isArray(body?.utterances)) return apiError("utterances is required", 400);
  const utterances: { start: number; end: number; text: string; translation: string | null }[] = [];
  for (const u of body.utterances) {
    if (!u || typeof u !== "object") return apiError("invalid utterances", 400);
    const { start, end, text, translation } = u as {
      start?: unknown;
      end?: unknown;
      text?: unknown;
      translation?: unknown;
    };
    if (typeof text !== "string" || !text.trim()) continue;
    const startSec = typeof start === "number" && start >= 0 ? start : 0;
    utterances.push({
      start: startSec,
      end: typeof end === "number" && end >= startSec ? end : startSec,
      text: text.trim(),
      translation:
        typeof translation === "string" && translation.trim() ? translation.trim() : null,
    });
  }
  if (utterances.length === 0) return apiError("no utterances", 400);

  const meeting = await prisma.meeting.findUnique({
    where: { id },
    select: { id: true, startedAt: true },
  });
  if (!meeting) return apiError("not found", 404);

  // What produced *this* transcript. The column was only ever written when the meeting was
  // created, so "Transcribed with" reported the model chosen back then no matter how many
  // times it had been re-recognised since -- and named a local model even when the work was
  // done by an endpoint somewhere else.
  const usedModel =
    typeof body?.usedModel === "string" && body.usedModel.trim()
      ? body.usedModel.trim().slice(0, 120)
      : null;

  const base = meeting.startedAt.getTime();
  await prisma.$transaction([
    ...(usedModel ? [prisma.meeting.update({ where: { id }, data: { whisperModel: usedModel } })] : []),
    prisma.transcript.deleteMany({ where: { meetingId: id } }),
    prisma.transcript.createMany({
      data: utterances.map((u, i) => ({
        meetingId: id,
        speakerType: SELF_KEY,
        text: u.text,
        translation: u.translation,
        audioStartMs: Math.round(u.start * 1000),
        audioEndMs: Math.round(u.end * 1000),
        // Spacing the rows by their audio offsets keeps `orderBy: createdAt` in the order the
        // words were spoken, which diarization relies on to map speakers onto utterances.
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
