import { NextRequest, NextResponse } from "next/server";
import { apiError, readJson } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Enrolled voice profiles (voiceprints). Enrollment happens per meeting via
// POST /api/meetings/[id]/save-voice-profiles, or directly here with an embedding
// extracted by the STT host's /voiceprint (guided recording in Settings).
export async function GET() {
  const profiles = await prisma.speakerProfile.findMany({
    select: { name: true, sourceMeetingId: true, updatedAt: true },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(profiles);
}

// Save a profile from a directly extracted embedding (Settings → guided recording).
// Upsert by name: re-recording under the same name refreshes the voiceprint.
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
  await prisma.speakerProfile.upsert({
    where: { name },
    update: { embedding: JSON.stringify(embedding), sourceMeetingId: null },
    create: { name, embedding: JSON.stringify(embedding), sourceMeetingId: null },
  });
  return NextResponse.json({ ok: true, name });
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
