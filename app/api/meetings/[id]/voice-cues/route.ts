import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { extensionOff } from "@/app/api/extension-off";
import { prisma } from "@/lib/prisma";
import { sttInternalUrl } from "@/lib/stt/internal";
import { type Measured, relativeCues } from "@/lib/voice-cues";

export const runtime = "nodejs";
export const maxDuration = 120;

// Voice cues (an extension): measure how each line was said and store it against the speaker's
// own average (lib/voice-cues.ts). No model and no queue — the service does arithmetic over the
// recording, seconds for an hour of it — so this answers when it is done.
//
// Measured again on each run: a line moved to another speaker, or a recording trimmed, changes
// what "usual" is for everybody.
export async function POST(_req: NextRequest, ctx: RouteContext<"/api/meetings/[id]">) {
  const off = await extensionOff("voiceCues");
  if (off) return off;
  const { id } = await ctx.params;

  const lines = await prisma.transcript.findMany({
    where: { meetingId: id },
    orderBy: { createdAt: "asc" },
    select: { id: true, speakerType: true, text: true, audioStartMs: true, audioEndMs: true },
  });
  const placed = lines.filter(
    (l) => typeof l.audioStartMs === "number" && typeof l.audioEndMs === "number" && l.audioEndMs > l.audioStartMs,
  );
  if (placed.length === 0) return apiError("No line has a place in the recording to measure.", 409);

  const res = await fetch(`${sttInternalUrl()}/recordings/${encodeURIComponent(id)}/voice`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      utterances: placed.map((l) => ({ start: l.audioStartMs! / 1000, end: l.audioEndMs! / 1000 })),
    }),
    signal: AbortSignal.timeout(110_000),
  }).catch(() => null);
  if (!res) return apiError("Cannot reach the transcription service.", 502);
  if (res.status === 404) {
    return apiError("The recording is no longer kept, so how each line was said cannot be measured.", 404);
  }
  const body = (await res.json().catch(() => null)) as { lines?: Measured[]; detail?: string } | null;
  if (!res.ok || !Array.isArray(body?.lines)) {
    return apiError("Measuring the recording failed: {reason}", 502, {
      vars: { reason: body?.detail ?? `HTTP ${res.status}` },
    });
  }

  const cues = relativeCues(
    placed.map((l, i) => ({ id: l.id, speaker: l.speakerType, text: l.text, measured: body.lines![i] ?? null })),
  );
  // Every line is written, measured or not: one left from an earlier run would be judged
  // against a "usual" that no longer exists.
  await prisma.$transaction(
    lines.map((l) => {
      const c = cues.get(l.id);
      return prisma.transcript.update({
        where: { id: l.id },
        data: { voice: c && Object.keys(c).length > 0 ? JSON.stringify(c) : null },
      });
    }),
  );
  return NextResponse.json({ measured: cues.size, lines: lines.length });
}
