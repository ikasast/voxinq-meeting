import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { sttInternalUrl } from "@/lib/stt/internal";

export const runtime = "nodejs";
// Minutes, not seconds: this is somebody's hour-long recording arriving over a phone's uplink.
export const maxDuration = 900;

/**
 * A ceiling, not a target. The transcription service reads the body into memory to decode it,
 * so something has to say no before the machine does; half a gigabyte is several hours of any
 * format a phone produces.
 */
const MAX_BYTES = 512 * 1024 * 1024;

/**
 * The reason, without the noise around it.
 *
 * ffmpeg's complaint about a file it cannot read arrives with its own version banner attached,
 * and the last line is the only part that means anything. This ends up in a notification on a
 * phone, where there is room for one sentence.
 */
function oneLine(detail: string | undefined): string | undefined {
  if (!detail) return undefined;
  const lines = detail
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length <= 1) return detail.trim();
  return `${lines[0].split(":")[0]}: ${lines[lines.length - 1]}`;
}

/**
 * Hand this meeting an audio file to be its recording.
 *
 * For the Android app, which can be given a recording made by another app — a voice recorder,
 * a file in a chat — and has no business knowing the transcription service's address or
 * deciding whether a meeting may be overwritten. Both of those live here.
 *
 * The file is *stored*, not recognised: `POST /api/meetings/{id}/transcribe` is the next call,
 * and it queues the recognition like any other, so it survives the phone being pocketed and
 * does not start a second GPU job behind the queue's back. (An older transcription service
 * ignores `transcribe=false` and starts one anyway; the queued job then waits for that run and
 * applies its result, which is the harmless way for a version mismatch to land.)
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const meeting = await prisma.meeting.findUnique({
    where: { id },
    select: { id: true, deletedAt: true, _count: { select: { transcripts: true } } },
  });
  if (!meeting || meeting.deletedAt) return apiError("meeting not found", 404);
  // A meeting with a transcript has a recording the transcript describes. Replacing it would
  // leave the two about different audio, with nothing to say so.
  if (meeting._count.transcripts > 0) {
    return apiError("This meeting already has a transcript.", 409);
  }

  const length = Number(req.headers.get("content-length") ?? 0);
  if (Number.isFinite(length) && length > MAX_BYTES) {
    return apiError("That file is too large to import.", 413);
  }
  if (!req.body) return apiError("no audio in the request", 400);

  let res: Response;
  try {
    res = await fetch(`${sttInternalUrl()}/upload/${encodeURIComponent(id)}?transcribe=false`, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: req.body,
      // Node's fetch needs telling that the body is a stream we are still writing.
      duplex: "half",
    } as RequestInit & { duplex: "half" });
  } catch {
    return apiError("The transcription service could not be reached.", 502);
  }

  type Answer = { status?: string; detail?: string; seconds?: number };
  const text = await res.text();
  let parsed: Answer | null = null;
  try {
    parsed = JSON.parse(text) as Answer;
  } catch {
    /* not JSON — the message below carries the body instead */
  }
  if (!res.ok) {
    // The service's own sentence where there is one ("Could not read the audio: ..."), because
    // that is the part the person who picked the file can act on.
    return apiError(oneLine(parsed?.detail) ?? `Storing the audio failed (HTTP ${res.status})`, res.status);
  }
  // When did this meeting happen? Until now, when the file arrived — which is wrong in a way
  // that spreads: `applyTranscript` reconstructs each line's time as "meeting start + the
  // utterance's own offset", so every line of an hour-long recording imported at five o'clock
  // would be stamped after six. The recording's own length is the answer, and the service has
  // just measured it: the meeting ran for that long, up to now.
  const seconds = typeof parsed?.seconds === "number" ? parsed.seconds : null;
  if (seconds && seconds > 0) {
    await prisma.meeting.update({
      where: { id },
      data: { startedAt: new Date(Date.now() - Math.round(seconds * 1000)) },
    });
  }

  return NextResponse.json({ status: "stored", seconds });
}
