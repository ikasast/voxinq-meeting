import { NextRequest, NextResponse } from "next/server";
import { apiError, readJson } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { CURRENT_EMBEDDING_MODEL, comparable } from "@/lib/embedding-models";
import { mergeEmbedding, parseEmbedding } from "@/lib/voiceprint";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Enrolled voice profiles (voiceprints). Enrollment happens per meeting via
// POST /api/meetings/[id]/save-voice-profiles, or directly here with an embedding
// extracted by the STT host's /voiceprint (guided recording in Settings).
export async function GET() {
  const rows = await prisma.speakerProfile.findMany({
    select: {
      name: true,
      sourceMeetingId: true,
      sampleCount: true,
      updatedAt: true,
      embeddingModel: true,
    },
    orderBy: { name: "asc" },
  });
  // A profile from an older embedding model is not compared against anything — it would be a
  // meaningless number, not a poor score. Say so here so it can be shown rather than silently
  // never matching again.
  const profiles = rows.map((p) => ({
    ...p,
    stale: !comparable(p.embeddingModel, CURRENT_EMBEDDING_MODEL),
  }));
  return NextResponse.json(profiles);
}

// Save a profile from a directly extracted embedding (Settings → guided recording).
// Re-recording under the same name adds to the voiceprint (running average over every
// enrollment) instead of replacing it, so extra recordings make matching steadier.
export async function POST(req: NextRequest) {
  const body = await readJson<{ name?: unknown; embedding?: unknown }>(req);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) return apiError("name is required", 400);
  if (name.length > 60) return apiError("name too long (max 60)", 400);
  const embedding = body?.embedding;
  if (
    !Array.isArray(embedding) ||
    embedding.length === 0 ||
    embedding.length > 4096 ||
    !embedding.every((x) => typeof x === "number" && Number.isFinite(x))
  ) {
    return apiError("invalid embedding", 400);
  }
  const existing = await prisma.speakerProfile.findUnique({
    where: { name },
    select: { embedding: true, sampleCount: true, embeddingModel: true },
  });
  const merged = mergeEmbedding(
    existing ? parseEmbedding(existing.embedding) : null,
    existing?.sampleCount ?? 0,
    embedding,
    existing?.embeddingModel,
    CURRENT_EMBEDDING_MODEL,
  );
  await prisma.speakerProfile.upsert({
    where: { name },
    update: {
      embedding: JSON.stringify(merged.embedding),
      sampleCount: merged.sampleCount,
      embeddingModel: CURRENT_EMBEDDING_MODEL,
      sourceMeetingId: null,
    },
    create: {
      name,
      embedding: JSON.stringify(embedding),
      embeddingModel: CURRENT_EMBEDDING_MODEL,
      sourceMeetingId: null,
    },
  });
  return NextResponse.json({ ok: true, name, sampleCount: merged.sampleCount });
}

export async function DELETE(req: NextRequest) {
  const name = new URL(req.url).searchParams.get("name")?.trim();
  if (!name) return apiError("name is required", 400);
  try {
    await prisma.speakerProfile.delete({ where: { name } });
  } catch {
    return apiError("not found", 404);
  }
  return NextResponse.json({ ok: true });
}
