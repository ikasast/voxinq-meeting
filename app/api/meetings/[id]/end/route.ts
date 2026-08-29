import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

// STT is on the same host as the web app, so reach it directly over loopback (avoids the
// public Tailscale URL). Override with STT_INTERNAL_URL if it runs elsewhere.
//
// 127.0.0.1 rather than localhost on purpose. The STT service binds IPv4, but `localhost`
// resolves to ::1 first on Windows — so any other process holding IPv6 :8000 (a container
// publishing the same port, say) silently answers instead of the STT service, and this
// request quietly reaches the wrong server.
const STT_INTERNAL_URL = process.env.STT_INTERNAL_URL ?? "http://127.0.0.1:8000";

// Mark a meeting as ended (set endedAt). Called from the recording screen's end action,
// after the STT server has finished saving the WAV — so we can read its recorded length
// and store it (shown as the meeting's actual recording time in the list).
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Best-effort: fetch the recorded length from STT. Never fails the "end" over this.
  let recordedMs: number | undefined;
  try {
    const st = (await fetch(`${STT_INTERNAL_URL}/recordings/${id}`, {
      signal: AbortSignal.timeout(5000),
    }).then((r) => (r.ok ? r.json() : null))) as
      | { exists?: boolean; durationSec?: number | null }
      | null;
    if (st?.exists && typeof st.durationSec === "number" && st.durationSec > 0) {
      recordedMs = Math.round(st.durationSec * 1000);
    }
  } catch {
    // STT unreachable / no recording — leave recordedMs unset (list falls back to the
    // transcript span).
  }

  try {
    // A scheduled meeting carries its diary time in startedAt, which is right until it is
    // recorded and wrong afterwards -- recorded on Wednesday, a meeting booked for Tuesday
    // would read "Tue 14:00 – Wed 15:20". Now that the length is known, wind the start back
    // from the end to where the recording actually began.
    const endedAt = new Date();
    const before = await prisma.meeting.findUnique({
      where: { id },
      select: { scheduledAt: true },
    });
    const correctedStart =
      before?.scheduledAt && recordedMs !== undefined
        ? new Date(endedAt.getTime() - recordedMs)
        : undefined;

    const ended = await prisma.meeting.update({
      where: { id },
      data: {
        endedAt,
        ...(recordedMs !== undefined ? { recordedMs } : {}),
        ...(correctedStart ? { startedAt: correctedStart } : {}),
      },
    });
    return NextResponse.json(ended);
  } catch {
    return apiError("not found", 404);
  }
}
