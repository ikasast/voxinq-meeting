import { NextRequest, NextResponse, after } from "next/server";
import { prisma } from "@/lib/prisma";
import { requestSummary } from "@/lib/llm";
import { parseSpeakerLabels } from "@/lib/speakers";

export const runtime = "nodejs";
export const maxDuration = 90;

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { meetingId?: unknown } | null;
  const meetingId = typeof body?.meetingId === "string" ? body.meetingId : "";
  if (!meetingId) {
    return NextResponse.json({ error: "meetingId is required" }, { status: 400 });
  }

  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    select: { id: true, description: true, speakerLabels: true, summaryStatus: true },
  });
  if (!meeting) {
    return NextResponse.json({ error: "meeting not found" }, { status: 404 });
  }

  // Global single-flight: only one minutes generation at a time, since concurrent LLM runs
  // contend for the (single) GPU. Reject if this or any other meeting is already generating.
  const inFlight = await prisma.meeting.findFirst({
    where: { summaryStatus: "processing" },
    select: { id: true, title: true },
  });
  if (inFlight) {
    const mine = inFlight.id === meetingId;
    return NextResponse.json(
      {
        error: mine
          ? "Minutes are already being generated for this meeting."
          : `Busy: minutes are being generated for "${inFlight.title}". Please wait until it finishes.`,
        busyMeetingId: inFlight.id,
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

  // Set the processing flag and run minutes generation in the background (after the response is sent).
  await prisma.meeting.update({
    where: { id: meetingId },
    data: { summaryStatus: "processing" },
  });

  const description = meeting.description;
  const speakerLabels = parseSpeakerLabels(meeting.speakerLabels);
  const transcriptInput = transcripts.map((t) => ({
    speakerType: t.speakerType,
    text: t.text,
    createdAt: t.createdAt,
  }));

  after(async () => {
    try {
      const summaryText = await requestSummary(transcriptInput, { description, speakerLabels });
      await prisma.meetingSummary.create({ data: { meetingId, summaryText } });
      await prisma.meeting.update({
        where: { id: meetingId },
        data: { summaryStatus: "done" },
      });
    } catch (e) {
      console.error("summary generation failed", e);
      await prisma.meeting
        .update({ where: { id: meetingId }, data: { summaryStatus: "error" } })
        .catch(() => {});
    }
  });

  return NextResponse.json({ status: "processing" }, { status: 202 });
}
