import { NextRequest, NextResponse } from "next/server";
import { apiError, readJson } from "@/lib/api";
import { reindexAfterWrite } from "@/lib/crypto/reindex-hook";
import { prisma } from "@/lib/prisma";
import { openJobFor } from "@/lib/queue/queue";
import { planTrim } from "@/lib/recording/trim";

export const runtime = "nodejs";

// STT runs on the same host, so reach it over loopback (see the meeting-end route).
const STT_INTERNAL_URL = process.env.STT_INTERNAL_URL ?? "http://127.0.0.1:8000";

// Keep only [startMs, endMs) of a meeting's recording, and the lines that fall in it.
//
// For a meeting left recording after it ended. The recording is cut first, by the STT service,
// because that is the half that can fail on its own (no recording, a run of speaker separation
// on it); the transcript follows only once the audio is cut, so the two cannot end up describing
// different recordings. There is no undo: the confirmation on the page says so.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await readJson<{ startMs?: unknown; endMs?: unknown; dryRun?: unknown }>(req);
  const startMs = body?.startMs;
  const endMs = body?.endMs;
  if (!Number.isInteger(startMs) || !Number.isInteger(endMs) || (startMs as number) < 0) {
    return apiError("startMs and endMs must be whole milliseconds", 400);
  }
  const from = startMs as number;
  const to = endMs as number;
  if (to - from < 1000) return apiError("Keep at least one second of the recording.", 400);

  const meeting = await prisma.meeting.findUnique({
    where: { id },
    select: { id: true, startedAt: true, endedAt: true },
  });
  if (!meeting) return apiError("meeting not found", 404);
  if (!meeting.endedAt) return apiError("End the meeting before trimming its recording.", 409);
  // A recognition or a speaker separation reads the recording and writes lines back by position.
  for (const kind of ["transcribe", "diarize"] as const) {
    if (await openJobFor(kind, id)) {
      return apiError("Wait until the work queued for this meeting has finished, then trim.", 409);
    }
  }

  const rows = await prisma.transcript.findMany({
    where: { meetingId: id },
    orderBy: { createdAt: "asc" },
    select: { id: true, audioStartMs: true, audioEndMs: true },
  });
  const state = (await fetch(`${STT_INTERNAL_URL}/recordings/${id}`, { signal: AbortSignal.timeout(10_000) })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null)) as { exists?: boolean; segments?: { start: number; end: number }[] } | null;
  if (!state?.exists) return apiError("This meeting has no recording to trim.", 404);
  const plan = planTrim(rows, state.segments ?? null, from, to);
  // Asked before the confirmation, so it can say exactly how many lines will go.
  if (body?.dryRun === true) {
    return NextResponse.json({ removed: plan.dropIds.length, total: rows.length });
  }

  const res = await fetch(`${STT_INTERNAL_URL}/recordings/${id}/trim`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ startMs: from, endMs: to, drop: plan.drop, expectedCount: rows.length }),
    // Copying the kept part of a long recording takes a while.
    signal: AbortSignal.timeout(300_000),
  }).catch((e: Error) => e);
  if (res instanceof Error || !res.ok) {
    const reason =
      res instanceof Error
        ? res.message
        : (((await res.json().catch(() => null)) as { detail?: string } | null)?.detail ?? `HTTP ${res.status}`);
    return apiError("The recording could not be trimmed: {reason}", 502, { vars: { reason } });
  }
  const cut = (await res.json()) as { beforeMs: number; headMs: number; durationMs: number; synced: boolean };

  // The lines that remain keep their wall-clock times; only their place in the recording moves
  // back by the cut head, and the meeting's start and end move in by what was cut off each side.
  const tailMs = Math.max(0, cut.beforeMs - cut.headMs - cut.durationMs);
  await prisma.$transaction([
    prisma.transcript.deleteMany({ where: { id: { in: plan.dropIds } } }),
    prisma.transcript.updateMany({
      where: { meetingId: id, audioStartMs: { gte: cut.headMs } },
      data: { audioStartMs: { decrement: cut.headMs }, audioEndMs: { decrement: cut.headMs } },
    }),
    ...plan.straddling.map((lineId) =>
      prisma.transcript.update({
        where: { id: lineId },
        data: { audioStartMs: 0, audioEndMs: { decrement: cut.headMs } },
      }),
    ),
    prisma.meeting.update({
      where: { id },
      data: {
        startedAt: new Date(meeting.startedAt.getTime() + cut.headMs),
        endedAt: new Date(meeting.endedAt.getTime() - tailMs),
        recordedMs: cut.durationMs,
      },
    }),
  ]);
  await reindexAfterWrite(id);

  return NextResponse.json({
    removed: plan.dropIds.length,
    durationMs: cut.durationMs,
    // False when the recording's boundaries had already drifted from the lines; speaker
    // separation should be run again before its names are trusted.
    synced: cut.synced,
  });
}
