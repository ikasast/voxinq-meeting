import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { suggestCorrections, type UtteranceForCorrection } from "@/lib/llm/correct";
import { prisma } from "@/lib/prisma";
import { getSttGlossary } from "@/lib/settings";

export const runtime = "nodejs";
export const maxDuration = 120;

// Propose fixes for glossary terms Whisper misheard, so the minutes are built from the right
// words. Suggestions only — applying one goes through PATCH /api/transcripts/[id] like a
// manual edit, so the user decides line by line. Nothing is stored here.
export async function POST(_req: NextRequest, ctx: RouteContext<"/api/meetings/[id]">) {
  const { id } = await ctx.params;

  // Uses the same GPU as minutes generation, so refuse rather than contend with it
  // (identical to the ask route).
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

  const meeting = await prisma.meeting.findUnique({
    where: { id },
    select: { id: true, series: { select: { sttGlossary: true } } },
  });
  if (!meeting) return apiError("meeting not found", 404);

  // Same composition as recording: the global glossary plus the series' own terms.
  const glossary = [await getSttGlossary(), meeting.series?.sttGlossary ?? ""]
    .filter((s) => s && s.trim())
    .join(", ");
  if (!glossary) {
    return apiError(
      "No glossary to check against. Add terms in Settings → Transcription (or on the series).",
      400,
    );
  }

  // Same order diarization and the minutes use.
  const rows = await prisma.transcript.findMany({
    where: { meetingId: id },
    orderBy: { createdAt: "asc" },
    select: { id: true, text: true },
  });
  const utterances: UtteranceForCorrection[] = rows.filter((r) => r.text.trim());
  if (utterances.length === 0) return apiError("this meeting has no transcript yet", 400);

  try {
    const result = await suggestCorrections(utterances, glossary);
    return NextResponse.json(result);
  } catch (e) {
    return apiError(`Failed to check the transcript: ${(e as Error).message}`, 502);
  }
}
