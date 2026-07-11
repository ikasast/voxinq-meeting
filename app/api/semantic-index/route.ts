import { NextResponse } from "next/server";
import { indexMeeting } from "@/lib/embeddings";
import { getEmbeddingConfig } from "@/lib/settings";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const maxDuration = 60;

const BATCH = 10;

// Backfill the semantic-search index: embed up to BATCH meetings that have no vector
// (or one built with a different model) per call. The client calls repeatedly until
// remaining reaches 0. New meetings are indexed automatically after minutes generation.
export async function POST() {
  const { model } = await getEmbeddingConfig();
  const candidates = await prisma.meeting.findMany({
    where: {
      deletedAt: null,
      OR: [{ embedding: null }, { embeddingModel: { not: model } }],
    },
    select: { id: true },
    orderBy: { createdAt: "desc" },
  });

  let indexed = 0;
  for (const m of candidates.slice(0, BATCH)) {
    try {
      await indexMeeting(m.id);
      indexed += 1;
    } catch (e) {
      // Model missing / Ollama down: report instead of hammering every candidate.
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "indexing failed", indexed },
        { status: 502 },
      );
    }
  }
  return NextResponse.json({ indexed, remaining: Math.max(0, candidates.length - indexed) });
}
