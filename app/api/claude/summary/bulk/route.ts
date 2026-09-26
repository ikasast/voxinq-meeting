import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { tick } from "@/lib/queue/dispatcher";
import { minutesOverrides } from "@/lib/meetings/bulk-minutes";
import { enqueue, openJobFor } from "@/lib/queue/queue";

export const runtime = "nodejs";

// Ask for the minutes of several meetings at once.
//
// The single-meeting route (../route.ts) refuses when something is already queued for that
// meeting, because one meeting with two sets of minutes is a duplicate rather than a queue.
// Here a meeting in that state is simply left out and counted: the person asked for "these
// twelve", and failing all twelve over one that was already waiting would be answering a
// question nobody asked. What comes back says how many went and how many did not.
//
// The queue decides what actually runs when. This only puts them in it.
//
// A format, a detail level and a provider can come with the batch, for this batch only — the
// same three the single-meeting route takes, applied to every meeting in it and saved nowhere.
const MAX_AT_ONCE = 200;

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as
    | ({ meetingIds?: unknown } & Record<string, unknown>)
    | null;
  const params = minutesOverrides(body);
  const ids = Array.isArray(body?.meetingIds)
    ? [...new Set(body.meetingIds.filter((v): v is string => typeof v === "string" && v.length > 0))]
    : [];
  if (ids.length === 0) {
    return NextResponse.json({ error: "meetingIds is required" }, { status: 400 });
  }
  if (ids.length > MAX_AT_ONCE) {
    return NextResponse.json(
      { error: `Too many meetings at once (limit ${MAX_AT_ONCE}).` },
      { status: 400 },
    );
  }

  // One query, and it is also the ownership check: the client is scoped, so somebody else's
  // meeting simply is not here.
  const meetings = await prisma.meeting.findMany({
    where: { id: { in: ids } },
    select: { id: true, _count: { select: { transcripts: true } } },
  });
  const found = new Map(meetings.map((m) => [m.id, m]));

  const queued: string[] = [];
  const skipped: { id: string; reason: string }[] = [];

  for (const id of ids) {
    const meeting = found.get(id);
    if (!meeting) {
      skipped.push({ id, reason: "not found" });
      continue;
    }
    if (meeting._count.transcripts === 0) {
      skipped.push({ id, reason: "no utterances" });
      continue;
    }
    if (await openJobFor("minutes", id)) {
      skipped.push({ id, reason: "already queued" });
      continue;
    }
    // Queued first, then said, as the single-meeting route does: the list should say so while
    // it waits its turn, and a meeting saying it with no job behind it is what the sweep
    // collects — so the job exists before the meeting claims it.
    await enqueue({ kind: "minutes", meetingId: id, params });
    await prisma.meeting.update({
      where: { id },
      data: { summaryStatus: "processing", summaryError: null },
    });
    queued.push(id);
  }

  if (queued.length > 0) void tick();
  return NextResponse.json({ queued: queued.length, skipped }, { status: queued.length ? 202 : 200 });
}
