import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { defaultSpeakerName, diarizerLabelToKey, parseSpeakerLabels } from "@/lib/speakers";
import { cleanClusterEmbeddings } from "@/lib/voiceprint";

export const runtime = "nodejs";

// Enroll voice profiles from this meeting: for each diarized cluster whose speaker the
// user has named, save the cluster's embedding under that name (upsert — re-enrolling
// refreshes the voiceprint). Requires that diarization was run after voiceprint support
// was added (the meeting must have stored cluster embeddings).
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const meeting = await prisma.meeting.findUnique({
    where: { id },
    select: { id: true, speakerLabels: true, diarizationEmbeddings: true },
  });
  if (!meeting) return apiError("not found", 404);
  if (!meeting.diarizationEmbeddings) {
    return apiError(
      "No voice embeddings stored for this meeting. Run Auto-diarize (again) first — the recording must still exist.",
      400,
    );
  }

  let raw: unknown;
  try {
    raw = JSON.parse(meeting.diarizationEmbeddings);
  } catch {
    return apiError("Stored embeddings are corrupted. Re-run Auto-diarize.", 400);
  }
  const clusters = cleanClusterEmbeddings(raw);
  const labels = parseSpeakerLabels(meeting.speakerLabels);

  const saved: string[] = [];
  const skipped: string[] = [];
  for (const [cluster, embedding] of Object.entries(clusters)) {
    const key = diarizerLabelToKey(cluster);
    const name = labels[key]?.trim();
    // Only enroll speakers the user explicitly named; skip default "Speaker N" clusters.
    if (!name || name === defaultSpeakerName(key)) {
      skipped.push(key);
      continue;
    }
    await prisma.speakerProfile.upsert({
      where: { name },
      update: { embedding: JSON.stringify(embedding), sourceMeetingId: id },
      create: { name, embedding: JSON.stringify(embedding), sourceMeetingId: id },
    });
    saved.push(name);
  }

  if (saved.length === 0) {
    return apiError(
      'No named speakers to enroll. Name the diarized speakers under "Speaker names" first.',
      400,
    );
  }
  return NextResponse.json({ saved, skipped });
}
