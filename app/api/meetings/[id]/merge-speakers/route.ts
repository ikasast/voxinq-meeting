import { NextResponse } from "next/server";
import { extensionOff } from "@/app/api/extension-off";
import { apiError, readJson } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { isSpeakerKey, readNames } from "@/lib/speakers";

export const runtime = "nodejs";

// Make several of a meeting's speakers one.
//
// Separation asked for seven voices, naming found five people: two voices were given the same
// name because they were the same person. Separating again with the right number needs the
// recording; saying "these are one speaker" needs only the lines. Each line of `from` becomes
// `into`'s, and `from` leaves the names. It cannot be told apart again without separating the
// recording afresh, which the screen says before it is done.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const off = await extensionOff("speakers");
  if (off) return off;
  const { id } = await params;
  const body = await readJson<{ into?: unknown; from?: unknown }>(req);
  const into = typeof body?.into === "string" ? body.into : "";
  const from = Array.isArray(body?.from) ? body.from.filter((k): k is string => typeof k === "string") : [];
  if (!isSpeakerKey(into) || from.length === 0 || !from.every(isSpeakerKey) || from.includes(into)) {
    return apiError("into and from must be different speakers", 400);
  }
  const meeting = await prisma.meeting.findUnique({ where: { id }, select: { id: true, speakerLabels: true } });
  if (!meeting) return apiError("meeting not found", 404);

  const { count } = await prisma.transcript.updateMany({
    where: { meetingId: id, speakerType: { in: from } },
    data: { speakerType: into },
  });
  const names = readNames(meeting.speakerLabels);
  for (const k of from) delete names[k];
  await prisma.meeting.update({ where: { id }, data: { speakerLabels: JSON.stringify(names) } });
  return NextResponse.json({ ok: true, lines: count, speakerLabels: names });
}
