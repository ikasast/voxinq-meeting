import { NextRequest, NextResponse } from "next/server";
import { apiError, readJson } from "@/lib/api";
import { normalizeInclude } from "@/lib/minutes-context";
import { prisma } from "@/lib/prisma";
import { enqueue, openJobFor } from "@/lib/queue/queue";
import { tick } from "@/lib/queue/dispatcher";

export const runtime = "nodejs";

// Ask for the minutes to be written. The writing itself is a queued job — see
// lib/queue/runners/minutes.ts — so this route validates, queues, and returns.
//
// It used to run the generation in an `after()` and refuse outright while any meeting was
// generating, because two LLM runs would contend for the one card. The refusal is now a
// position in a queue instead. What is still refused is a *second* job for the same meeting:
// two sets of minutes for one meeting is not a queue, it is a duplicate.
export async function POST(req: NextRequest) {
  const body = await readJson<Record<string, unknown>>(req);
  // Each field is a string or absent; anything else counts as not sent.
  const field = (name: string) => {
    const value = body?.[name];
    return typeof value === "string" ? value : undefined;
  };
  const meetingId = field("meetingId");
  if (!meetingId) return apiError("meetingId is required", 400);

  // Overrides for this run only, never saved. writeMinutes validates the values.
  const provider = field("provider");
  const templateId = field("templateId");
  // Which context goes in with the transcript; absent leaves it to the template.
  const include = normalizeInclude(body?.include);

  // Counted through the scoped client, so someone else's meeting is "not found" like a missing one.
  if ((await prisma.meeting.count({ where: { id: meetingId } })) === 0) {
    return apiError("meeting not found", 404);
  }

  const already = await openJobFor("minutes", meetingId);
  if (already) {
    return NextResponse.json(
      {
        error:
          already.status === "running"
            ? "Minutes are already being generated for this meeting."
            : "Minutes for this meeting are already waiting in the queue.",
        busyMeetingId: meetingId,
      },
      { status: 409 },
    );
  }

  // Nothing said, nothing to write minutes from.
  if ((await prisma.transcript.count({ where: { meetingId } })) === 0) {
    return apiError("No utterances recorded", 400);
  }

  // The job is the whole record that this was asked for: the screens read it, so there is
  // nothing to write on the meeting. What the meeting keeps is how the last attempt ended, and
  // that is written when this one does.
  await enqueue({ kind: "minutes", meetingId, params: { provider, templateId, ...(include ? { include } : {}) } });
  // Nudge the loop so a queue that is empty does not wait out a tick before starting.
  void tick();

  return NextResponse.json({ status: "processing" }, { status: 202 });
}
