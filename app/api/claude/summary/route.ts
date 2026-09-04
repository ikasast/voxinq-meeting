import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { enqueue, openJobFor } from "@/lib/queue/queue";
import { tick } from "@/lib/queue/dispatcher";

export const runtime = "nodejs";

// Ask for the minutes to be written. The writing itself is a queued job — see
// lib/queue/runners/minutes.ts — so this route validates, queues, and returns.
//
// It used to run the generation in an `after()` and refuse outright while any meeting was
// generating, because two LLM runs would contend for the one card. The refusal is now a
// position in a queue instead. What is still refused is a *second* job for the same meeting:
// two sets of minutes for one meeting is not a queue, it is a duplicate.
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as
    | { meetingId?: unknown; detail?: unknown; provider?: unknown; templateId?: unknown }
    | null;
  const meetingId = typeof body?.meetingId === "string" ? body.meetingId : "";
  if (!meetingId) {
    return NextResponse.json({ error: "meetingId is required" }, { status: 400 });
  }

  // Overrides for this run only, never saved. requestSummary validates the values.
  const detail = typeof body?.detail === "string" ? body.detail : undefined;
  const provider = typeof body?.provider === "string" ? body.provider : undefined;
  const templateId = typeof body?.templateId === "string" ? body.templateId : undefined;

  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    select: { id: true },
  });
  if (!meeting) {
    return NextResponse.json({ error: "meeting not found" }, { status: 404 });
  }

  const already = await openJobFor("minutes", meetingId);
  if (already) {
    return NextResponse.json(
      {
        error:
          already.status === "running"
            ? "Minutes are already being generated for this meeting."
            : "Minutes for this meeting are already waiting in the queue.",
        busyMeetingId: meetingId,
      },
      { status: 409 },
    );
  }

  const transcripts = await prisma.transcript.findMany({
    where: { meetingId },
    orderBy: { createdAt: "asc" },
  });

  if (transcripts.length === 0) {
    return NextResponse.json({ error: "No utterances recorded" }, { status: 400 });
  }

  // Marked before the job starts, deliberately: from here on something is under way for this
  // meeting, and the screen should say so whether the job is running or waiting its turn.
  await prisma.meeting.update({
    where: { id: meetingId },
    data: { summaryStatus: "processing", summaryError: null },
  });

  await enqueue({ kind: "minutes", meetingId, params: { detail, provider, templateId } });
  // Nudge the loop so a queue that is empty does not wait out a tick before starting.
  void tick();

  return NextResponse.json({ status: "processing" }, { status: 202 });
}
