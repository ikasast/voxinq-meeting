import { NextRequest, NextResponse } from "next/server";
import { extensionOff } from "@/app/api/extension-off";
import { apiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { tick } from "@/lib/queue/dispatcher";
import { enqueue, openJobFor } from "@/lib/queue/queue";

export const runtime = "nodejs";

// Ask for each line's emotion to be judged (Emotion, an extension). A queued job on the card,
// like diarization: lib/queue/runners/emotion.ts.
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const off = await extensionOff("emotion");
  if (off) return off;
  const { id } = await ctx.params;

  if ((await prisma.transcript.count({ where: { meetingId: id } })) === 0) {
    return apiError("This meeting has no transcript yet.", 400);
  }
  const already = await openJobFor("emotion", id);
  if (already) {
    return apiError("Emotion is already being judged for this meeting.", 409, { extra: { jobId: already.id } });
  }
  const job = await enqueue({ kind: "emotion", meetingId: id, params: {} });
  void tick();
  return NextResponse.json({ status: "queued", jobId: job.id }, { status: 202 });
}
