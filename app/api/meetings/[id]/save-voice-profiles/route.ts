import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { defaultSpeakerName, diarizerLabelToKey, parseSpeakerLabels } from "@/lib/speakers";
import { embeddingModel } from "@/lib/embedding-models";
import { cleanClusterEmbeddings, mergeEmbedding, parseEmbedding } from "@/lib/voiceprint";

export const runtime = "nodejs";

// Enroll voice profiles from this meeting: for each diarized cluster whose speaker the user
// has named, fold the cluster's embedding into that person's profile (re-enrolling averages
// with the previous recordings rather than replacing them). Requires that diarization was run
// after voiceprint support was added (the meeting must have stored cluster embeddings).
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const meeting = await prisma.meeting.findUnique({
    where: { id },
    select: {
      id: true,
      speakerLabels: true,
      diarizationEmbeddings: true,
      diarizationEmbeddingModel: true,
    },
  });
  if (!meeting) return apiError("not found", 404);
  if (!meeting.diarizationEmbeddings) {
    return apiError(
      "No voice embeddings stored for this meeting. Run Diarize (again) first — the recording must still exist.",
      400,
    );
  }

  let raw: unknown;
  try {
    raw = JSON.parse(meeting.diarizationEmbeddings);
  } catch {
    return apiError("Stored embeddings are corrupted. Re-run Diarize.", 400);
  }
  const clusters = cleanClusterEmbeddings(raw);
  const labels = parseSpeakerLabels(meeting.speakerLabels);
  // The model these embeddings came from, recorded when the diarization run was stored. Null
  // on meetings diarized before the backends split, which resolves to pyannote — correct,
  // since that was the only thing that produced them.
  const clusterModel = embeddingModel(meeting.diarizationEmbeddingModel).id;

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
    // Re-enrolling adds to the profile instead of replacing it: the stored voiceprint is the
    // average of every recording the person has been enrolled from.
    const existing = await prisma.speakerProfile.findUnique({
      where: { name },
      select: { embedding: true, sampleCount: true, embeddingModel: true },
    });
    const merged = mergeEmbedding(
      existing ? parseEmbedding(existing.embedding) : null,
      existing?.sampleCount ?? 0,
      embedding,
      existing?.embeddingModel,
      clusterModel,
    );
    await prisma.speakerProfile.upsert({
      where: { name },
      update: {
        embedding: JSON.stringify(merged.embedding),
        sampleCount: merged.sampleCount,
        embeddingModel: clusterModel,
        sourceMeetingId: id,
      },
      create: {
        name,
        embedding: JSON.stringify(embedding),
        embeddingModel: clusterModel,
        sourceMeetingId: id,
      },
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
