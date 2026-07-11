import { NextRequest, NextResponse } from "next/server";
import { apiError, readJson } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { getVoiceprintThreshold } from "@/lib/settings";
import { diarizerLabelToKey, parseSpeakerLabels } from "@/lib/speakers";
import { cleanClusterEmbeddings, matchProfiles, parseEmbedding } from "@/lib/voiceprint";

export const runtime = "nodejs";

// Store the per-cluster voice embeddings produced by a diarization run, then match them
// against enrolled voice profiles. Matched clusters get the profile's name in
// speakerLabels — but never overwrite a name the user already set on this meeting.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await readJson<{ embeddings?: unknown }>(req);
  const clusters = cleanClusterEmbeddings(body?.embeddings);

  const meeting = await prisma.meeting.findUnique({
    where: { id },
    select: { id: true, speakerLabels: true },
  });
  if (!meeting) return apiError("not found", 404);

  const labels = parseSpeakerLabels(meeting.speakerLabels);

  let matched: Record<string, string> = {};
  if (Object.keys(clusters).length > 0) {
    const rows = await prisma.speakerProfile.findMany({
      select: { name: true, embedding: true },
    });
    const profiles = rows
      .map((r) => ({ name: r.name, embedding: parseEmbedding(r.embedding) }))
      .filter((p): p is { name: string; embedding: number[] } => p.embedding !== null);

    const matches = matchProfiles(clusters, profiles, await getVoiceprintThreshold());
    for (const [cluster, m] of Object.entries(matches)) {
      const key = diarizerLabelToKey(cluster);
      if (!labels[key]?.trim()) {
        labels[key] = m.name;
        matched = { ...matched, [key]: m.name };
      }
    }
  }

  await prisma.meeting.update({
    where: { id },
    data: {
      diarizationEmbeddings: Object.keys(clusters).length ? JSON.stringify(clusters) : null,
      speakerLabels: JSON.stringify(labels),
    },
  });

  return NextResponse.json({ labels, matched });
}
