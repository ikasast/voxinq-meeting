import { NextRequest, NextResponse } from "next/server";
import { apiError, readJson } from "@/lib/api";
import { reindexAfterWrite } from "@/lib/crypto/reindex-hook";
import { prisma } from "@/lib/prisma";
import { openJobFor } from "@/lib/queue/queue";

export const runtime = "nodejs";

// STT runs on the same host, so reach it over loopback (see the meeting-end route).
const STT_INTERNAL_URL = process.env.STT_INTERNAL_URL ?? "http://127.0.0.1:8000";

/** More than any meeting has lines, and few enough for one request. */
const MAX_IDS = 20_000;

// Delete many lines of one meeting at once, and keep the recording's list of utterances in step.
//
// For the meeting nobody ended: an hour of the room after it emptied, transcribed as noise, and
// nothing to be gained by deleting it a line at a time. The recording stays — cutting it as well
// is the trim route's job, which this is the lighter half of.
//
// The recording keeps one boundary per line, and speaker separation maps speakers onto lines by
// position (see DELETE on /api/transcripts/[id]), so the same lines go there too, counted against
// the list as it was before any of them went.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await readJson<{ ids?: unknown }>(req);
  const ids = Array.isArray(body?.ids) ? [...new Set(body.ids.filter((x): x is string => typeof x === "string"))] : [];
  if (ids.length === 0) return apiError("Choose the lines to delete.", 400);
  if (ids.length > MAX_IDS) return apiError("Too many lines in one request.", 400);

  const meeting = await prisma.meeting.findUnique({ where: { id }, select: { id: true } });
  if (!meeting) return apiError("meeting not found", 404);
  // A recognition or a speaker separation writes lines back by position while it runs.
  for (const kind of ["transcribe", "diarize"] as const) {
    if (await openJobFor(kind, id)) {
      return apiError("Wait until the work queued for this meeting has finished, then delete.", 409);
    }
  }

  const rows = await prisma.transcript.findMany({
    where: { meetingId: id },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  const wanted = new Set(ids);
  const indices = rows.flatMap((r, i) => (wanted.has(r.id) ? [i] : []));
  if (indices.length === 0) return apiError("Those lines are not in this meeting.", 404);

  const synced = await dropSegments(id, indices, rows.length);

  const { count } = await prisma.transcript.deleteMany({
    where: { meetingId: id, id: { in: indices.map((i) => rows[i].id) } },
  });
  await reindexAfterWrite(id);
  return NextResponse.json({ deleted: count, synced });
}

/**
 * The same lines out of the recording's boundaries. One request; a service from before it took a
 * list answers 400, and then one at a time from the end, so each index still means what it did.
 */
async function dropSegments(meetingId: string, indices: number[], count: number): Promise<boolean> {
  const call = (body: object) =>
    fetch(`${STT_INTERNAL_URL}/recordings/${meetingId}/segments/delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
  try {
    const res = await call({ indices, expectedCount: count });
    if (res.status !== 400) {
      const d = (await res.json().catch(() => null)) as { synced?: boolean } | null;
      return Boolean(d?.synced);
    }
    let left = count;
    for (const index of [...indices].sort((a, b) => b - a)) {
      const r = await call({ index, expectedCount: left });
      const d = (await r.json().catch(() => null)) as { synced?: boolean } | null;
      if (!d?.synced) return false;
      left -= 1;
    }
    return true;
  } catch {
    // No service, or no recording kept: the lines still go, and the caller hears they are no
    // longer aligned with it.
    return false;
  }
}
