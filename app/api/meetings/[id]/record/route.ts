import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { isExternalRequest } from "@/lib/is-tailnet";
import { prisma } from "@/lib/prisma";
import { gpuContenders, reserveForRecording } from "@/lib/queue/recording";
import { recordingPlan } from "@/lib/recording/plan";
import { readSettings } from "@/lib/settings";
import { sttInternalUrl } from "@/lib/stt/internal";

export const runtime = "nodejs";

// Start recording a meeting with no page open: what the Android app asks for when **Record** is
// pressed on a meeting's notice — on the phone's lock screen, or on a watch the notice was
// forwarded to. It answers with everything the recorder needs, decided as the recording page
// would decide it (lib/recording/plan.ts), and reserves the card when nothing else wants it.
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (await isExternalRequest()) {
    return apiError("Recording is not available from an external network", 403);
  }
  const { id } = await ctx.params;
  const meeting = await prisma.meeting.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      whisperModel: true,
      sttLanguage: true,
      endedAt: true,
      deletedAt: true,
      series: { select: { sttGlossary: true } },
    },
  });
  if (!meeting || meeting.deletedAt) return apiError("meeting not found", 404);
  if (meeting.endedAt) {
    return apiError("This meeting has already ended. Recording cannot be restarted.", 409);
  }

  // Where the phone reaches the transcription service: the same value the pages are given.
  const wsUrl = process.env.STT_WS_URL || process.env.NEXT_PUBLIC_STT_WS_URL;
  if (!wsUrl) return apiError("STT_WS_URL is not set on the server.", 503);

  // Unreachable counts as "can keep up": the recording connects and waits for the service
  // either way, and the card is reserved as it would be from the page.
  let deferredHost = false;
  try {
    const res = await fetch(`${sttInternalUrl()}/health`, { signal: AbortSignal.timeout(5000) });
    const health = (await res.json().catch(() => null)) as { liveTranscription?: boolean } | null;
    deferredHost = health?.liveTranscription === false;
  } catch {
    /* see above */
  }
  const contended = !deferredHost && (await gpuContenders()).length > 0;

  const settings = await readSettings();
  const plan = recordingPlan({
    meeting,
    settings,
    seriesGlossary: meeting.series?.sttGlossary,
    wsUrl,
    deferredHost,
    contended,
  });
  if (plan.reserve) await reserveForRecording(meeting.id, plan.model);
  return NextResponse.json(plan);
}
