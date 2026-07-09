import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { diarizerLabelToKey, isValidSpeakerKey } from "@/lib/speakers";

export const runtime = "nodejs";

// Apply diarization results to the transcript.
// body.speakers[i] is the diarizer label ("speaker0" etc.) for the i-th utterance (in creation order).
// Convert these to speaker keys ("partner-0" etc.) and bulk-update each transcript's speakerType.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { speakers?: unknown } | null;
  const speakers = body?.speakers;
  if (!Array.isArray(speakers) || !speakers.every((s) => typeof s === "string")) {
    return NextResponse.json({ error: "invalid speakers" }, { status: 400 });
  }

  const transcripts = await prisma.transcript.findMany({
    where: { meetingId: id },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (transcripts.length === 0) {
    return NextResponse.json({ error: "no transcripts" }, { status: 404 });
  }

  // Even if the utterance count and label count differ, apply only the overlapping range (best-effort).
  const n = Math.min(transcripts.length, speakers.length);
  const usedKeys = new Set<string>();
  const updates = [];
  for (let i = 0; i < n; i++) {
    const key = diarizerLabelToKey(speakers[i] as string); // "speakerN" -> "partner-N"
    if (!isValidSpeakerKey(key)) continue;
    usedKeys.add(key);
    updates.push(
      prisma.transcript.update({
        where: { id: transcripts[i].id },
        data: { speakerType: key },
      }),
    );
  }
  await prisma.$transaction(updates);

  return NextResponse.json({
    updated: updates.length,
    transcriptCount: transcripts.length,
    speakerCount: speakers.length,
    speakerKeys: [...usedKeys].sort(),
  });
}
