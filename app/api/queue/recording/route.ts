import { NextRequest, NextResponse } from "next/server";
import { tick } from "@/lib/queue/dispatcher";
import {
  gpuContenders,
  preemptForRecording,
  releaseRecording,
  reserveForRecording,
} from "@/lib/queue/recording";

export const runtime = "nodejs";

// A recording asking for the card, and giving it back.
//
// POST is asked twice by design. The first time it reports what is in the way and reserves
// nothing, so the screen can put the question to a person: take the card, or record without
// live text. The second time carries their answer.
//
// It is not asked at all when nothing is in the way — the reservation is made and the button
// just works. A confirmation that appears every time is one people learn to click through.
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const meetingId = typeof body.meetingId === "string" ? body.meetingId : "";
  if (!meetingId) return NextResponse.json({ error: "meetingId is required" }, { status: 400 });

  const model = typeof body.model === "string" ? body.model : null;
  // "I do not need the card" — the recording will not recognise as it goes, so there is nothing
  // to arbitrate and nothing to interrupt.
  if (body.live === false) {
    return NextResponse.json({ reserved: false, recordOnly: true, contenders: [] });
  }

  const contenders = await gpuContenders();
  if (contenders.length > 0 && body.interrupt !== true) {
    // Nothing is reserved and nothing is stopped: this is the question, not the answer.
    return NextResponse.json({ reserved: false, contenders });
  }

  const interrupted = contenders.length > 0 ? await preemptForRecording() : 0;
  const job = await reserveForRecording(meetingId, model);
  return NextResponse.json({ reserved: true, jobId: job.id, interrupted, contenders: [] });
}

// Handing the card back. Also called on the way out of the recording screen, so a meeting that
// ends by the tab closing does not leave the queue holding a reservation forever.
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const meetingId = searchParams.get("meetingId") ?? "";
  if (!meetingId) return NextResponse.json({ error: "meetingId is required" }, { status: 400 });
  const released = await releaseRecording(meetingId);
  // What was interrupted is at the front of the queue; let it go now rather than at the next tick.
  if (released > 0) void tick();
  return NextResponse.json({ released });
}
