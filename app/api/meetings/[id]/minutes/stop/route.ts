import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { abortGeneration } from "@/lib/llm/generation-registry";
import { unloadOllama } from "@/lib/llm/ollama";
import { prisma } from "@/lib/prisma";
import { abortJob } from "@/lib/queue/dispatcher";
import { finish, openJobFor } from "@/lib/queue/queue";
import { STOPPED_REASON } from "@/lib/queue/types";
import { getLlmConfig } from "@/lib/settings";

export const runtime = "nodejs";

// Stop the minutes for one meeting, from that meeting's own screen.
//
// Separate from `/api/claude/summary/abort`, which only ever interrupts a generation that is
// *running* — it is what a recording calls to take the GPU back, and it must leave the rest of
// the queue alone. This is the other question: "stop what I asked for on this meeting", whose
// answer has to cover the job that has not started yet. That is now the common case, because
// minutes run one at a time: send a day's worth and all but one of them are waiting.
//
// Stopping one that never started is also how a meeting got stuck. The status is set when the
// work is queued and cleared by the runner, so taking the job away left the card saying the
// minutes were coming for good — and **Write them all** skips a meeting that looks busy, so
// there was no way back.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Somebody else's meeting is not found, as on every other route.
  const meeting = await prisma.meeting.findUnique({
    where: { id },
    select: { id: true, summaryStatus: true },
  });
  if (!meeting) return apiError("meeting not found", 404);

  const job = await openJobFor("minutes", id);
  let wasRunning = false;
  if (job) {
    wasRunning = job.status === "running";
    if (wasRunning) {
      abortJob(job.id);
      abortGeneration(id);
    }
    await finish(job.id, "cancelled", "Stopped.");
  }

  // Written even when there was no job: a meeting left saying `processing` with nothing behind
  // it is exactly what this screen's Stop is being pressed for.
  const stopped = Boolean(job) || meeting.summaryStatus === "processing";
  if (stopped) {
    await prisma.meeting.update({
      where: { id },
      data: { summaryStatus: "error", summaryError: STOPPED_REASON },
    });
  }

  // Only when something was actually generating: unloading costs the next run its model load,
  // and there is nothing to free when the job was only waiting.
  if (wasRunning) {
    const cfg = await getLlmConfig();
    if (cfg.provider === "ollama") await unloadOllama(cfg);
  }

  return NextResponse.json({ stopped, wasRunning });
}
