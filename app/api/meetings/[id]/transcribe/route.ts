import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { tick } from "@/lib/queue/dispatcher";
import { enqueue, openJobFor } from "@/lib/queue/queue";
import { resolveDestination } from "@/lib/queue/runners/transcribe";

export const runtime = "nodejs";

// Ask for a saved recording to be recognised again. The work is a queued job — see
// lib/queue/runners/transcribe.ts.
//
// This route already existed for one reason: choosing a saved endpoint means the request
// carries an API key, and the browser is not a place to put one. Now it queues instead of
// starting, which also means the run survives the tab being closed — the browser used to be
// the thing polling for the result and applying it.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  const meeting = await prisma.meeting.findUnique({ where: { id }, select: { id: true } });
  if (!meeting) return NextResponse.json({ error: "meeting not found" }, { status: 404 });

  const already = await openJobFor("transcribe", id);
  if (already) {
    return NextResponse.json(
      { error: "This meeting is already being re-transcribed.", jobId: already.id },
      { status: 409 },
    );
  }

  const params = {
    profileId: typeof body.profileId === "string" ? body.profileId : undefined,
    model: typeof body.model === "string" ? body.model : undefined,
    language: typeof body.language === "string" ? body.language : undefined,
    initialPrompt: typeof body.initialPrompt === "string" ? body.initialPrompt : undefined,
    translate: body.translate === true,
  };

  // Resolved now, not when the job runs: an endpoint that is no longer saved should be refused
  // while someone is looking at the button, not minutes later when the job reaches the front.
  let usedModel = "";
  try {
    ({ usedModel } = await resolveDestination(params));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  const job = await enqueue({ kind: "transcribe", meetingId: id, params });
  void tick();
  return NextResponse.json({ status: "queued", jobId: job.id, usedModel }, { status: 202 });
}
