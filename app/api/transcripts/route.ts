import { NextRequest, NextResponse } from "next/server";
import { apiError, readJson } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { isValidSpeakerKey } from "@/lib/speakers";

export const runtime = "nodejs";

// The recording screen saves finalized utterances one at a time.
export async function POST(req: NextRequest) {
  const body = await readJson<{ meetingId?: unknown; speakerType?: unknown; text?: unknown }>(req);

  const meetingId = typeof body?.meetingId === "string" ? body.meetingId : null;
  const speakerType =
    typeof body?.speakerType === "string" && isValidSpeakerKey(body.speakerType)
      ? body.speakerType
      : null;
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!meetingId || !speakerType || !text) return apiError("invalid payload", 400);

  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    select: { id: true },
  });
  if (!meeting) return apiError("meeting not found", 404);

  const created = await prisma.transcript.create({ data: { meetingId, speakerType, text } });
  return NextResponse.json(created, { status: 201 });
}
