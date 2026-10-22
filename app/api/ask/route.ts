import { NextRequest, NextResponse } from "next/server";
import { apiError, readJson } from "@/lib/api";
import { extensionOff } from "@/app/api/extension-off";
import { conversationText } from "@/lib/llm";
import { askBoth, askMinutes, askTranscript, type MeetingForAsk } from "@/lib/llm/ask";
import { readNames } from "@/lib/speakers";
import { minutesInFlight } from "@/lib/meetings/minutes-state";
import { prisma } from "@/lib/prisma";
import { translate } from "@/lib/i18n";
import { currentLocale } from "@/lib/i18n/server";
import { currentUser } from "@/lib/auth/session";
import { keepTurn } from "@/lib/ask-history";

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
    // "transcript" reads one meeting's own words instead of its minutes; "both" reads the
    // meeting's words and the minutes together, which is what the panel asks for by default.
    source?: unknown;
    // Send the answer as it is written (NDJSON) rather than all at the end.
    stream?: unknown;
  }>(req);
  const question = typeof body?.question === "string" ? body.question.trim() : "";
  if (!question) return apiError("question is required", 400);
  if (question.length > QUESTION_MAX) {
    return apiError(`question must be ${QUESTION_MAX} chars or fewer`, 400);
  }
  const stream = body?.stream === true;
  const seriesId = typeof body?.seriesId === "string" ? body.seriesId : "";
  const meetingId = typeof body?.meetingId === "string" ? body.meetingId : "";
  // Kept to be read again (lib/ask-history.ts): on the meeting it was asked on, or on the series.
  const me = await currentUser();
  const where = meetingId ? { meetingId } : { seriesId };
  const asked = (source: string) => ({ ownerId: me?.id ?? null, ...where, source, question });
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

  // Both: the meeting's own words, and the minutes around it. Where either is missing the
  // answer comes from the other, as if it had been asked for alone.
  if (body?.source === "both" && meetingId) {
    const meeting = await transcriptOf(meetingId);
    if (!meeting) return apiError("meeting not found", 404);
    const found = await minutesOf(seriesId, meetingId);
    if (!found) return apiError(seriesId ? "series not found" : "meeting not found", 404);
    const anyMinutes = found.meetings.some((m) => m.minutes && m.minutes.trim());
    if (meeting.transcripts.length > 0 && anyMinutes) {
      const conversation = conversationText(meeting.transcripts, readNames(meeting.speakerLabels));
      return answer(stream, asked("both"), async (onText) => ({
        ...(await askBoth(
          question,
          { title: meeting.title, startedAt: meeting.startedAt, conversation },
          found.meetings,
          found.scopeLabel,
          undefined,
          onText,
        )),
        source: "both",
      }));
    }
    if (meeting.transcripts.length > 0) body.source = "transcript";
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
    const conversation = conversationText(meeting.transcripts, readNames(meeting.speakerLabels));
    return answer(stream, asked("transcript"), async (onText) => {
      const { answer: text, condensed, parts } = await askTranscript(
        question,
        { title: meeting.title, startedAt: meeting.startedAt, conversation },
        undefined,
        onText,
      );
      return { answer: text, condensed, parts, source: "transcript", used: 1, omitted: 0, withoutMinutes: 0 };
    });
  }

  const found = await minutesOf(seriesId, meetingId);
  if (!found) return apiError(seriesId ? "series not found" : "meeting not found", 404);
  const { scopeLabel, meetings } = found;

  // Nothing to answer from is known before the model is asked, so it is said up front rather
  // than as a stream that ends in an error.
  if (!meetings.some((m) => m.minutes && m.minutes.trim())) {
    return apiError("No minutes to answer from yet. Generate minutes for at least one meeting first.", 400);
  }
  return answer(stream, asked("minutes"), async (onText) => askMinutes(question, meetings, scopeLabel, undefined, onText));
}

/**
 * The answer, whole or as it is written.
 *
 * Streamed, the body is NDJSON: {"text": "..."} for each piece of the answer as the model writes
 * it, then one last line with everything the whole answer would have carried ({"done": true,
 * answer, used, ...}), or {"error": "..."} if it failed after the first byte had gone. The first
 * words then appear once the material is read, rather than the whole answer after it is written.
 */
async function answer(
  stream: boolean,
  turn: Parameters<typeof keepTurn>[0],
  run: (onText?: (delta: string) => void) => Promise<Record<string, unknown>>,
): Promise<Response> {
  // The answer, kept beside the question it answered; its id and time go back with it.
  const keep = async (result: Record<string, unknown>) => ({ ...result, ...(await keepTurn(turn, result)) });
  if (!stream) {
    try {
      return NextResponse.json(await keep(await run()));
    } catch (e) {
      return apiError("Failed to answer: {reason}", 502, { vars: { reason: (e as Error).message } });
    }
  }
  const locale = await currentLocale();
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (line: Record<string, unknown>) => controller.enqueue(encoder.encode(`${JSON.stringify(line)}\n`));
      try {
        const result = await keep(await run((text) => send({ text })));
        send({ done: true, ...result });
      } catch (e) {
        send({ error: translate(locale, "Failed to answer: {reason}", { reason: (e as Error).message }) });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(body, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}

/** One meeting with its transcript, for reading what was said. */
function transcriptOf(meetingId: string) {
  return prisma.meeting.findUnique({
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
}

/**
 * The minutes to answer from: the series' when there is one, the meeting's own when not.
 * Newest first — the context builder drops the oldest meetings when they do not all fit.
 */
async function minutesOf(
  seriesId: string,
  meetingId: string,
): Promise<{ scopeLabel: string; meetings: MeetingForAsk[] } | null> {
  const select = {
    title: true,
    startedAt: true,
    summaries: { orderBy: { createdAt: "desc" as const }, take: 1, select: { summaryText: true } },
  };
  let scopeLabel: string;
  let rows: { title: string; startedAt: Date; summaries: { summaryText: string }[] }[];
  if (seriesId) {
    const series = await prisma.series.findUnique({ where: { id: seriesId }, select: { name: true } });
    if (!series) return null;
    scopeLabel = series.name;
    rows = await prisma.meeting.findMany({
      where: { seriesId, deletedAt: null },
      orderBy: { startedAt: "desc" },
      select,
    });
  } else {
    const meeting = await prisma.meeting.findUnique({ where: { id: meetingId }, select });
    if (!meeting) return null;
    scopeLabel = meeting.title;
    rows = [meeting];
  }
  return {
    scopeLabel,
    meetings: rows.map((m) => ({
      title: m.title,
      startedAt: m.startedAt,
      minutes: m.summaries[0]?.summaryText ?? null,
    })),
  };
}
