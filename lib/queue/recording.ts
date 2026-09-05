import { prisma } from "@/lib/prisma";
import { sttInternalUrl } from "@/lib/stt/internal";
import { readSettings } from "@/lib/settings";
import { whisperModel } from "@/lib/stt/models";
import { abortGeneration } from "@/lib/llm/generation-registry";
import { abortJob } from "./dispatcher";
import { RECORDING_KIND } from "./types";
import { cancelDiarize } from "./runners/diarize";

// A recording's claim on the GPU.
//
// A recording is not a queued job — nothing schedules it, it starts when someone presses a
// button in a room where people are already talking. But while it is going it needs the card
// as much as anything in the queue does, and the queue has to know, or it will start a
// five-gigabyte job underneath a live transcription.
//
// So it takes a row: `kind = "recording"`, already `running`, holding what live recognition
// needs. The dispatcher does not know it is special. It simply does not fit anything else in.

export { RECORDING_KIND };

/** What live recognition will hold: the model this meeting is recording with. */
async function recordingCostMb(model?: string | null): Promise<number> {
  const s = await readSettings();
  const size = whisperModel(model || s.whisperModel)?.sizeGb;
  return Math.round((size ?? 3) * 1024);
}

export type Contender = { id: string; kind: string; meetingId: string | null; title: string | null };

/**
 * What is holding the card right now, other than recordings.
 *
 * Only jobs that actually use it: work sent to an endpoint or a cloud model is priced at zero
 * and is no reason to ask anybody anything. This is what makes the question rare enough to be
 * worth answering — a confirmation that appears every time is one people learn to click through.
 */
export async function gpuContenders(): Promise<Contender[]> {
  const rows = await prisma.job.findMany({
    where: { status: "running", vramMb: { gt: 0 }, kind: { not: RECORDING_KIND } },
    select: { id: true, kind: true, meetingId: true, meeting: { select: { title: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    meetingId: r.meetingId,
    title: r.meeting?.title ?? null,
  }));
}

/**
 * Stop what is running and put it back at the front of the queue.
 *
 * Back in the queue, not thrown away: the person interrupting wants to record, not to abandon
 * their minutes. It will not start again while the recording holds the card — which is the
 * whole point — so in practice it resumes when the meeting ends. Said in `detail`, because a
 * job that silently restarts an hour later looks like a bug.
 */
export async function preemptForRecording(): Promise<number> {
  const contenders = await gpuContenders();
  for (const c of contenders) {
    abortJob(c.id);
    if (c.kind === "diarize" && c.meetingId) await cancelDiarize(c.meetingId);
    if (c.kind === "minutes" && c.meetingId) abortGeneration(c.meetingId);
  }
  if (contenders.length === 0) return 0;
  const { count } = await prisma.job.updateMany({
    where: { id: { in: contenders.map((c) => c.id) } },
    data: {
      status: "queued",
      startedAt: null,
      position: 0,
      detail: "Interrupted so a recording could start. It runs again once the meeting ends.",
    },
  });
  return count;
}

/** Take the card for a recording. Idempotent: pressing record twice is not two recordings. */
export async function reserveForRecording(meetingId: string, model?: string | null) {
  const existing = await prisma.job.findFirst({
    where: { kind: RECORDING_KIND, meetingId, status: "running" },
    select: { id: true },
  });
  if (existing) return existing;
  return prisma.job.create({
    data: {
      kind: RECORDING_KIND,
      meetingId,
      status: "running",
      startedAt: new Date(),
      vramMb: await recordingCostMb(model),
      detail: "Recording.",
    },
    select: { id: true },
  });
}

/**
 * Give it back.
 *
 * Called when the meeting ends, when the screen goes away, and when the tab is closed. None of
 * those are guaranteed — a laptop lid closes, a phone kills a background tab — so
 * `sweepStaleRecordings` is the backstop.
 */
export async function releaseRecording(meetingId: string): Promise<number> {
  const { count } = await prisma.job.updateMany({
    where: { kind: RECORDING_KIND, meetingId, status: "running" },
    data: { status: "done", finishedAt: new Date(), detail: "Recording finished." },
  });
  return count;
}

/**
 * Long enough for the browser to press record, be answered, and open the websocket. A
 * reservation is taken before the connection exists, so anything shorter would sweep away a
 * recording that is still starting.
 */
const SWEEP_GRACE_MS = 90_000;

/**
 * Release reservations for meetings that are not actually being recorded.
 *
 * The reservation is released by the screen that took it, which covers ending a meeting and
 * closing the tab — but not a browser that dies, a phone that discards a background tab, or a
 * laptop lid closed on the way out of the room. Without this the queue would hold a card for a
 * meeting that stopped hours ago and never run anything again, which is the worst failure this
 * feature could have: it is silent, and it looks like the queue is broken.
 *
 * The STT service knows which meetings have a live connection, so it is asked. If it cannot be
 * reached, nothing is released — "I could not ask" is not "nothing is recording".
 */
export async function sweepStaleRecordings(): Promise<number> {
  const held = await prisma.job.findMany({
    where: {
      kind: RECORDING_KIND,
      status: "running",
      startedAt: { lt: new Date(Date.now() - SWEEP_GRACE_MS) },
    },
    select: { id: true, meetingId: true },
  });
  const ids = held.map((h) => h.meetingId).filter((v): v is string => Boolean(v));
  if (ids.length === 0) return 0;

  let live: Record<string, string | null>;
  try {
    const res = await fetch(`${sttInternalUrl()}/activity`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return 0;
    live = (await res.json()) as Record<string, string | null>;
  } catch {
    return 0;
  }

  const stale = held.filter((h) => h.meetingId && live[h.meetingId] !== "recording");
  if (stale.length === 0) return 0;
  const { count } = await prisma.job.updateMany({
    where: { id: { in: stale.map((s) => s.id) } },
    data: {
      status: "done",
      finishedAt: new Date(),
      detail: "Recording ended without saying so; the GPU was handed back.",
    },
  });
  return count;
}
