import { NextRequest, NextResponse } from "next/server";
import { apiError, readJson } from "@/lib/api";
import { extensionOff } from "@/app/api/extension-off";
import { conversationText } from "@/lib/llm";
import { askMinutes, askTranscript, type MeetingForAsk } from "@/lib/llm/ask";
import { readNames } from "@/lib/speakers";
import { minutesInFlight } from "@/lib/meetings/minutes-state";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
// Reading a whole meeting's transcript is a bigger prompt than a set of minutes, and a long
// one is condensed in several passes first. Self-hosted, so this is a ceiling rather than a
// bill.
export const maxDuration = 300;

const QUESTION_MAX = 500;

// Answer a question from a series' minutes ("what were the TODOs from last time?").
// A meeting with no series is asked about on its own — a one-off is just a series of one.
// Nothing is stored: the answer is read once and discarded.
export async function POST(req: NextRequest) {
  const off = await extensionOff("ask");
  if (off) return off;
  const body = await readJson<{
    question?: unknown;
    seriesId?: unknown;
    meetingId?: unknown;
    // "transcript" reads one meeting's own words instead of its minutes.
    source?: unknown;
  }>(req);
  const question = typeof body?.question === "string" ? body.question.trim() : "";
  if (!question) return apiError("question is required", 400);
  if (question.length > QUESTION_MAX) {
    return apiError(`question must be ${QUESTION_MAX} chars or fewer`, 400);
  }
  const seriesId = typeof body?.seriesId === "string" ? body.seriesId : "";
  const meetingId = typeof body?.meetingId === "string" ? body.meetingId : "";
  if (!seriesId && !meetingId) return apiError("seriesId or meetingId is required", 400);
  if (seriesId) {
    const off = await extensionOff("series");
    if (off) return off;
  }

  // Answering uses the same GPU as minutes generation, so refuse rather than contend with it.
  const inFlight = await minutesInFlight();
  if (inFlight) {
    return apiError(
      "Busy: minutes are being generated for “{title}”. Please wait until it finishes.",
      409,
      { vars: { title: inFlight.title } },
    );
  }

  // One meeting, read in full: what was actually said, for a question the minutes cannot
  // answer — or for a meeting that has none yet, which is most of a conference week.
  if (body?.source === "transcript") {
    if (!meetingId) return apiError("meetingId is required to read a transcript", 400);
    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
      select: {
        title: true,
        startedAt: true,
        speakerLabels: true,
        transcripts: {
          orderBy: { createdAt: "asc" },
          select: { speakerType: true, text: true, createdAt: true },
        },
      },
    });
    if (!meeting) return apiError("meeting not found", 404);
    if (meeting.transcripts.length === 0) {
      return apiError("This meeting has no transcript to read.", 400);
    }
    try {
      const { answer, condensed } = await askTranscript(question, {
        title: meeting.title,
        startedAt: meeting.startedAt,
        conversation: conversationText(
          meeting.transcripts,
          readNames(meeting.speakerLabels),
        ),
      });
      return NextResponse.json({
        answer,
        condensed,
        source: "transcript",
        used: 1,
        omitted: 0,
        withoutMinutes: 0,
      });
    } catch (e) {
      return apiError("Failed to answer: {reason}", 502, { vars: { reason: (e as Error).message } });
    }
  }

  // Newest first — the context builder drops the oldest meetings when they do not all fit.
  const select = {
    title: true,
    startedAt: true,
    summaries: { orderBy: { createdAt: "desc" as const }, take: 1, select: { summaryText: true } },
  };
  let scopeLabel: string;
  let rows: { title: string; startedAt: Date; summaries: { summaryText: string }[] }[];

  if (seriesId) {
    const series = await prisma.series.findUnique({
      where: { id: seriesId },
      select: { name: true },
    });
    if (!series) return apiError("series not found", 404);
    scopeLabel = series.name;
    rows = await prisma.meeting.findMany({
      where: { seriesId, deletedAt: null },
      orderBy: { startedAt: "desc" },
      select,
    });
  } else {
    const meeting = await prisma.meeting.findUnique({ where: { id: meetingId }, select });
    if (!meeting) return apiError("meeting not found", 404);
    scopeLabel = meeting.title;
    rows = [meeting];
  }

  const meetings: MeetingForAsk[] = rows.map((m) => ({
    title: m.title,
    startedAt: m.startedAt,
    minutes: m.summaries[0]?.summaryText ?? null,
  }));

  try {
    const result = await askMinutes(question, meetings, scopeLabel);
    if (!result.answer && result.used === 0) {
      return apiError(
        "No minutes to answer from yet. Generate minutes for at least one meeting first.",
        400,
      );
    }
    return NextResponse.json(result);
  } catch (e) {
    return apiError("Failed to answer: {reason}", 502, { vars: { reason: (e as Error).message } });
  }
}
