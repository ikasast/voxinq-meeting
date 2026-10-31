import { NextRequest, NextResponse } from "next/server";
import { apiError, readJson } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { addQuestion, keepQuestion, type Prep, readPrep, removeQuestion } from "@/lib/prep/prep";
import { tick } from "@/lib/queue/dispatcher";
import { enqueue, openJobFor } from "@/lib/queue/queue";

export const runtime = "nodejs";

// Getting ready for the questions after a talk (lib/prep): what has been prepared so far, the
// switch, updating now, and the person's own changes to the list.

/** A run still queued after this long is waiting for the card, not for the next tick. */
const WAITING_AFTER_MS = 10_000;

const isWaiting = (job: { status: string; createdAt: Date } | null) =>
  job?.status === "queued" && Date.now() - job.createdAt.getTime() > WAITING_AFTER_MS;

async function state(meetingId: string, enabled: boolean) {
  const [row, job] = await Promise.all([
    prisma.meetingPrep.findFirst({ where: { meetingId } }),
    prisma.job.findFirst({
      where: { kind: "prep", meetingId, status: { in: ["queued", "running"] } },
      select: { status: true, createdAt: true },
    }),
  ]);
  return { enabled, prep: readPrep(row?.body), job: job?.status ?? null, waiting: isWaiting(job) };
}

async function edit(meetingId: string, change: (p: Prep) => Prep) {
  const row = await prisma.meetingPrep.findFirst({ where: { meetingId } });
  const body = JSON.stringify(change(readPrep(row?.body)));
  if (row) await prisma.meetingPrep.update({ where: { meetingId }, data: { body } });
  else await prisma.meetingPrep.create({ data: { meetingId, body } });
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const meeting = await prisma.meeting.findUnique({ where: { id }, select: { prepEnabled: true } });
  if (!meeting) return apiError("meeting not found", 404);
  return NextResponse.json(await state(id, meeting.prepEnabled));
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const meeting = await prisma.meeting.findUnique({ where: { id }, select: { prepEnabled: true } });
  if (!meeting) return apiError("meeting not found", 404);
  const body = await readJson<{ action?: unknown; on?: unknown; text?: unknown; id?: unknown }>(req);
  const action = body?.action;
  let enabled = meeting.prepEnabled;

  if (action === "enable") {
    enabled = body?.on === true;
    await prisma.meeting.update({ where: { id }, data: { prepEnabled: enabled } });
  } else if (action === "run") {
    if (!(await openJobFor("prep", id))) {
      const lines = await prisma.transcript.count({ where: { meetingId: id } });
      if (lines === 0) return apiError("This meeting has no transcript yet.", 409);
      await enqueue({ kind: "prep", meetingId: id });
      void tick();
    }
  } else if (action === "add") {
    const text = typeof body?.text === "string" ? body.text.trim() : "";
    if (!text) return apiError("Enter a question.", 400);
    await edit(id, (p) => addQuestion(p, text));
  } else if ((action === "keep" || action === "remove") && typeof body?.id === "string") {
    const q = body.id;
    await edit(id, (p) => (action === "keep" ? keepQuestion(p, q) : removeQuestion(p, q)));
  } else {
    return apiError("unknown action", 400);
  }
  return NextResponse.json(await state(id, enabled));
}
