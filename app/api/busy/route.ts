import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Whether a GPU-bound minutes generation is under way (this app / Ollama). The single GPU is
// shared, so the UI uses this — plus the STT service's own /health "busy" — to stop a second
// task from being started while one is in progress.
//
// Read from the queue rather than from `summaryStatus`, so it reports the job that exists
// rather than a flag that has to be kept in step with it. `queued` counts as busy: from the
// screen's point of view the work has been asked for, and whether it has reached the front of
// the queue is the queue's business.
export async function GET() {
  // Any kind, not just minutes: diarization and re-transcription are queued jobs now too, and
  // a busy signal that only knows about one of the three would let the screen say "free" while
  // the card is occupied. The shape stays as it was — the UI reads `minutes` — until the queue
  // screen replaces this with the list.
  const job = await prisma.job.findFirst({
    where: { status: { in: ["running", "queued"] } },
    orderBy: [{ status: "desc" }, { position: "asc" }, { createdAt: "asc" }],
    select: { status: true, kind: true, meetingId: true, meeting: { select: { title: true } } },
  });
  return NextResponse.json({
    minutes: job
      ? {
          busy: true,
          meetingId: job.meetingId,
          title: job.meeting?.title ?? "",
          queued: job.status === "queued",
          kind: job.kind,
        }
      : { busy: false },
  });
}
