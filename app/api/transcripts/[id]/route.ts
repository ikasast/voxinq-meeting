import { NextRequest, NextResponse } from "next/server";
import { apiError, readJson } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { isValidSpeakerKey } from "@/lib/speakers";

export const runtime = "nodejs";

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
