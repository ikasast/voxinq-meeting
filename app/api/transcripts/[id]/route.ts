import { NextRequest, NextResponse } from "next/server";
import { apiError, readJson } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { isValidSpeakerKey } from "@/lib/speakers";

export const runtime = "nodejs";

// STT runs on the same host, so reach it over loopback (same pattern as the meeting-end route).
const STT_INTERNAL_URL = process.env.STT_INTERNAL_URL ?? "http://localhost:8000";

// Reassign the speaker of a single utterance (to manually fix diarization errors).
export async function PATCH(req: NextRequest, ctx: RouteContext<"/api/transcripts/[id]">) {
  const { id } = await ctx.params;

  const body = await readJson<{ speakerType?: unknown }>(req);
  const speakerType = typeof body?.speakerType === "string" ? body.speakerType : "";
  if (!isValidSpeakerKey(speakerType)) return apiError("invalid speakerType", 400);

  try {
    const updated = await prisma.transcript.update({ where: { id }, data: { speakerType } });
    return NextResponse.json(updated);
  } catch {
    return apiError("transcript not found", 404);
  }
}

// Delete a single utterance — used to drop hallucinations and audio glitches so they cannot
// reach the minutes. The recording keeps a parallel list of utterance boundaries that
// diarization maps speakers onto by index, so the matching boundary is removed there too;
// otherwise every later line would be attributed to the wrong speaker on the next run.
export async function DELETE(_req: NextRequest, ctx: RouteContext<"/api/transcripts/[id]">) {
  const { id } = await ctx.params;

  const target = await prisma.transcript.findUnique({
    where: { id },
    select: { id: true, meetingId: true },
  });
  if (!target) return apiError("transcript not found", 404);

  // Index within the meeting, in the same order the recording stored its boundaries.
  const siblings = await prisma.transcript.findMany({
    where: { meetingId: target.meetingId },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  const index = siblings.findIndex((t) => t.id === id);

  let synced = false;
  if (index >= 0) {
    try {
      const res = await fetch(
        `${STT_INTERNAL_URL}/recordings/${target.meetingId}/segments/delete`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ index, expectedCount: siblings.length }),
          signal: AbortSignal.timeout(5000),
        },
      );
      const d = (await res.json().catch(() => null)) as { synced?: boolean } | null;
      synced = Boolean(d?.synced);
    } catch {
      // STT unreachable or no recording kept — the transcript still goes, and the caller is
      // told the two are no longer aligned.
    }
  }

  await prisma.transcript.delete({ where: { id } });
  return NextResponse.json({ deleted: id, synced });
}
