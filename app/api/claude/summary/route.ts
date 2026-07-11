import { NextRequest, NextResponse, after } from "next/server";
import { prisma } from "@/lib/prisma";
import { requestSummary } from "@/lib/llm";
import { getLlmConfig } from "@/lib/settings";
import { parseSpeakerLabels } from "@/lib/speakers";

export const runtime = "nodejs";
export const maxDuration = 90;

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as
    | { meetingId?: unknown; detail?: unknown; provider?: unknown }
    | null;
  const meetingId = typeof body?.meetingId === "string" ? body.meetingId : "";
  if (!meetingId) {
    return NextResponse.json({ error: "meetingId is required" }, { status: 400 });
  }

  // Optional per-generation overrides (from the "Regenerate with options" panel).
  // Not persisted to settings — they only affect this run. Each provider uses its own
  // model configured in Settings; requestSummary validates these values.
  const detail = typeof body?.detail === "string" ? body.detail : undefined;
  const provider = typeof body?.provider === "string" ? body.provider : undefined;

  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    select: {
      id: true,
      description: true,
      speakerLabels: true,
      summaryStatus: true,
      seriesId: true,
      startedAt: true,
    },
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

  // Series context: the latest minutes of the previous meeting in the same series,
  // passed to the LLM as reference-only material (helps "continuing from last time").
  let previousMinutes: { title: string; date: string; text: string } | undefined;
  if (meeting.seriesId) {
    const prev = await prisma.meeting.findFirst({
      where: {
        seriesId: meeting.seriesId,
        deletedAt: null,
        id: { not: meeting.id },
        startedAt: { lt: meeting.startedAt },
        summaries: { some: {} },
      },
      orderBy: { startedAt: "desc" },
      select: {
        title: true,
        startedAt: true,
        summaries: { orderBy: { createdAt: "desc" }, take: 1, select: { summaryText: true } },
      },
    });
    if (prev?.summaries[0]) {
      previousMinutes = {
        title: prev.title,
        date: prev.startedAt.toISOString().slice(0, 10),
        text: prev.summaries[0].summaryText,
      };
    }
  }
  const transcriptInput = transcripts.map((t) => ({
    speakerType: t.speakerType,
    text: t.text,
    createdAt: t.createdAt,
  }));

  after(async () => {
    try {
      const summaryText = await requestSummary(transcriptInput, {
        description,
        speakerLabels,
        detail,
        provider,
        previousMinutes,
      });
      // Record which provider/model produced this version (mirrors the resolution
      // in requestSummary: valid override wins, else the saved setting).
      const cfg = await getLlmConfig();
      const effProvider =
        provider && ["ollama", "anthropic", "openai"].includes(provider)
          ? (provider as typeof cfg.provider)
          : cfg.provider;
      const effModel =
        effProvider === "ollama"
          ? cfg.ollamaModel
          : effProvider === "anthropic"
            ? cfg.anthropicModel
            : cfg.openaiModel;
      await prisma.meetingSummary.create({
        data: { meetingId, summaryText, provider: effProvider, model: effModel },
      });
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
