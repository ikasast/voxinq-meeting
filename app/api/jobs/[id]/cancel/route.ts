import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { abortJob } from "@/lib/queue/dispatcher";
import { finish } from "@/lib/queue/queue";
import { RECORDING_KIND } from "@/lib/queue/types";
import { cancelDiarize } from "@/lib/queue/runners/diarize";
import { abortGeneration } from "@/lib/llm/generation-registry";

export const runtime = "nodejs";

// Stop a job, whether it is waiting or already running.
//
// What "stop" can mean depends on the work, and the difference is worth being honest about:
//
//   queued      it never starts. Nothing to undo.
//   diarize     the STT service can kill the subprocess, so it really stops.
//   minutes     the LLM request is aborted mid-stream; the partial answer is discarded.
//   transcribe  the recognition pass runs to its end on the service and the result is thrown
//               away. There is no cancel endpoint for it, and pretending otherwise would mean
//               a button that reports success and frees nothing.
//   recording   refused. The row is a live meeting's hold on the card, and finishing it here
//               would not stop the recording — it would only hand the GPU to something else
//               while people are still talking into it.
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const job = await prisma.job.findUnique({
    where: { id },
    select: { id: true, kind: true, status: true, meetingId: true },
  });
  if (!job) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (job.kind === RECORDING_KIND) {
    return NextResponse.json(
      {
        error:
          "That is a recording in progress. Its hold on the GPU ends when the meeting does —" +
          " end the meeting from the recording screen.",
      },
      { status: 409 },
    );
  }
  if (job.status !== "queued" && job.status !== "running") {
    return NextResponse.json({ status: job.status, alreadyFinished: true });
  }

  if (job.status === "running") {
    abortJob(job.id);
    if (job.kind === "diarize" && job.meetingId) await cancelDiarize(job.meetingId);
    if (job.kind === "minutes" && job.meetingId) abortGeneration(job.meetingId);
  }

  await finish(job.id, "cancelled", "Stopped.");
  return NextResponse.json({ status: "cancelled", stopsImmediately: job.kind !== "transcribe" });
}
