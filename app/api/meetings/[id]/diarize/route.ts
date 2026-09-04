import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { tick } from "@/lib/queue/dispatcher";
import { enqueue, openJobFor } from "@/lib/queue/queue";

export const runtime = "nodejs";

// Ask for the speakers to be told apart. New: the browser used to call the STT service itself,
// watch it, and post the labels back — so closing the tab abandoned the run, and the button had
// to be disabled whenever anything else held the GPU.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  const count = await prisma.transcript.count({ where: { meetingId: id } });
  if (count === 0) {
    // Speakers are attached to utterances, so there is nothing to attach them to.
    return NextResponse.json({ error: "This meeting has no transcript yet." }, { status: 400 });
  }

  const already = await openJobFor("diarize", id);
  if (already) {
    return NextResponse.json(
      { error: "Speakers are already being separated for this meeting.", jobId: already.id },
      { status: 409 },
    );
  }

  const n = Number(body.numSpeakers);
  const job = await enqueue({
    kind: "diarize",
    meetingId: id,
    params: { numSpeakers: Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined },
  });
  void tick();
  return NextResponse.json({ status: "queued", jobId: job.id }, { status: 202 });
}
