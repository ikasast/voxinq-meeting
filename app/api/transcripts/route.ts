import { NextRequest, NextResponse } from "next/server";
import { apiError, readJson } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { isValidSpeakerKey } from "@/lib/speakers";

export const runtime = "nodejs";

// The recording screen saves finalized utterances one at a time.
export async function POST(req: NextRequest) {
  const body = await readJson<{
    meetingId?: unknown;
    speakerType?: unknown;
    text?: unknown;
    audioStartMs?: unknown;
    audioEndMs?: unknown;
  }>(req);

  const meetingId = typeof body?.meetingId === "string" ? body.meetingId : null;
  const speakerType =
    typeof body?.speakerType === "string" && isValidSpeakerKey(body.speakerType)
      ? body.speakerType
      : null;
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!meetingId || !speakerType || !text) return apiError("invalid payload", 400);

  // Position in the recording, sent by the STT service with each final. Optional: a meeting
  // recorded without saving audio has none, and it must not block saving the words.
  const offsetMs = (v: unknown) =>
    typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v) : null;
  const audioStartMs = offsetMs(body?.audioStartMs);
  const audioEndMs = offsetMs(body?.audioEndMs);

  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    select: { id: true },
  });
  if (!meeting) return apiError("meeting not found", 404);

  const created = await prisma.transcript.create({
    data: { meetingId, speakerType, text, audioStartMs, audioEndMs },
  });
  return NextResponse.json(created, { status: 201 });
}
