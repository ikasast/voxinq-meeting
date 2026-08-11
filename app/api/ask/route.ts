import { NextRequest, NextResponse } from "next/server";
import { apiError, readJson } from "@/lib/api";
import { askMinutes, type MeetingForAsk } from "@/lib/llm/ask";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const maxDuration = 90;

const QUESTION_MAX = 500;

// Answer a question from a series' minutes ("what were the TODOs from last time?").
// A meeting with no series is asked about on its own — a one-off is just a series of one.
// Nothing is stored: the answer is read once and discarded.
export async function POST(req: NextRequest) {
  const body = await readJson<{ question?: unknown; seriesId?: unknown; meetingId?: unknown }>(req);
  const question = typeof body?.question === "string" ? body.question.trim() : "";
  if (!question) return apiError("question is required", 400);
  if (question.length > QUESTION_MAX) {
    return apiError(`question must be ${QUESTION_MAX} chars or fewer`, 400);
  }
  const seriesId = typeof body?.seriesId === "string" ? body.seriesId : "";
  const meetingId = typeof body?.meetingId === "string" ? body.meetingId : "";
  if (!seriesId && !meetingId) return apiError("seriesId or meetingId is required", 400);

  // Answering uses the same GPU as minutes generation, so refuse rather than contend with it.
  const inFlight = await prisma.meeting.findFirst({
    where: { summaryStatus: "processing" },
    select: { title: true },
  });
  if (inFlight) {
    return apiError(
      `Busy: minutes are being generated for "${inFlight.title}". Please wait until it finishes.`,
      409,
    );
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
    return apiError(`Failed to answer: ${(e as Error).message}`, 502);
  }
}
