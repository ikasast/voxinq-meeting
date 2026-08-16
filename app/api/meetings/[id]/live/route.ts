import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Snapshot of a meeting's transcript for devices that are watching it being recorded.
//
// Only the recording device holds the WebSocket to the STT service, and it writes each
// utterance here as soon as it is final. So a second device does not need to reach STT at
// all — polling this route is enough to follow along, which also means read-only viewers
// outside the tailnet get live updates (this is a GET; recording never is).
//
// The whole list is returned each time rather than a since-cursor, because a translation
// arrives as a later PATCH to an utterance that may be minutes old. A createdAt cursor would
// never see it. A few hundred rows of text is small next to the audio already in flight.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const meeting = await prisma.meeting.findUnique({
    where: { id },
    select: {
      endedAt: true,
      summaryStatus: true,
      speakerLabels: true,
      transcripts: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          speakerType: true,
          text: true,
          translation: true,
          createdAt: true,
          audioStartMs: true,
        },
      },
    },
  });

  if (!meeting) return apiError("not found", 404);

  return NextResponse.json(
    {
      endedAt: meeting.endedAt,
      summaryStatus: meeting.summaryStatus,
      speakerLabels: meeting.speakerLabels,
      transcripts: meeting.transcripts,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
