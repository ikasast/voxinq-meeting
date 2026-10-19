import { NextRequest, NextResponse } from "next/server";
import { apiError, readJson } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { sttInternalUrl } from "@/lib/stt/internal";
import { deleteRecording } from "@/lib/trash";

export const runtime = "nodejs";

// Protect, unprotect or delete recordings from the storage screen, one or several at once.
//
// Server side rather than from the browser to the transcription service, as the meeting page's
// protect button does: the storage screen acts on several meetings at once, and which of them
// are the reader's own is the database's answer (prisma is scoped to the reader), not the
// browser's.
//
// Deleting removes the audio only. The transcript and the minutes stay; what goes is playing
// it back, re-transcribing and separating speakers again.

const ACTIONS = ["protect", "unprotect", "delete"] as const;
type Action = (typeof ACTIONS)[number];

export async function POST(req: NextRequest) {
  const body = await readJson<{ ids?: unknown; action?: unknown }>(req);
  const action = ACTIONS.find((a) => a === body?.action) as Action | undefined;
  const ids = Array.isArray(body?.ids)
    ? [...new Set(body.ids.filter((x): x is string => typeof x === "string"))].slice(0, 500)
    : [];
  if (!action || ids.length === 0) return apiError("invalid body", 400);

  // Only the reader's own meetings: the rest are not found, as everywhere else.
  const meetings = await prisma.meeting.findMany({
    where: { id: { in: ids } },
    select: { id: true, endedAt: true, startedAt: true },
  });
  // Not under a recording still going, nor under work that reads the audio.
  const busy = new Set(
    (
      await prisma.job.findMany({
        where: { meetingId: { in: meetings.map((m) => m.id) }, status: { in: ["queued", "running"] } },
        select: { meetingId: true },
      })
    ).map((j) => j.meetingId),
  );

  const done: string[] = [];
  const skipped: string[] = [];
  for (const m of meetings) {
    const recording = m.endedAt === null;
    if (action === "delete" && (recording || busy.has(m.id))) {
      skipped.push(m.id);
      continue;
    }
    const ok =
      action === "delete"
        ? await deleteRecording(m.id)
        : await protect(m.id, action === "protect");
    (ok ? done : skipped).push(m.id);
  }
  return NextResponse.json({ done, skipped });
}

async function protect(id: string, on: boolean): Promise<boolean> {
  try {
    const res = await fetch(`${sttInternalUrl()}/recordings/${encodeURIComponent(id)}/protect?on=${on}`, {
      method: "POST",
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
