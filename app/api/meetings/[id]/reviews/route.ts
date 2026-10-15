import { NextRequest, NextResponse } from "next/server";
import { extensionOff } from "@/app/api/extension-off";
import { apiError, readJson } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { tick } from "@/lib/queue/dispatcher";
import { enqueue, openJobFor } from "@/lib/queue/queue";
import { isReviewRole } from "@/lib/review/criteria";
import { REVIEW_SELECT, reviewView } from "@/lib/review/view";
import { nameOf, readNames } from "@/lib/speakers";

export const runtime = "nodejs";

// Meeting feedback (an extension) for one meeting: the reviews written so far, and asking for a
// new one — for its facilitator or one participant, by the name they speak under.

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const off = await extensionOff("review");
  if (off) return off;
  const { id } = await ctx.params;
  const meeting = await prisma.meeting.findUnique({ where: { id }, select: { id: true } });
  if (!meeting) return apiError("meeting not found", 404);
  const [rows, job] = await Promise.all([
    prisma.meetingReview.findMany({ where: { meetingId: id }, orderBy: { createdAt: "desc" }, select: REVIEW_SELECT }),
    openJobFor("review", id),
  ]);
  return NextResponse.json({ reviews: rows.map(reviewView), jobId: job?.id ?? null });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const off = await extensionOff("review");
  if (off) return off;
  const { id } = await ctx.params;
  const body = await readJson<{ role?: unknown; person?: unknown }>(req);
  const role = body?.role;
  const person = typeof body?.person === "string" ? body.person.trim() : "";
  if (!isReviewRole(role) || !person) return apiError("role and person are required", 400);

  const meeting = await prisma.meeting.findUnique({ where: { id }, select: { speakerLabels: true } });
  if (!meeting) return apiError("meeting not found", 404);
  const names = readNames(meeting.speakerLabels);
  const keys = await prisma.transcript.findMany({ where: { meetingId: id }, distinct: ["speakerType"], select: { speakerType: true } });
  if (!keys.some((k) => nameOf(k.speakerType, names) === person)) {
    return apiError("Nobody of that name speaks in this meeting.", 400);
  }
  // One at a time per meeting: a second while the first is waiting would be the same question.
  const already = await openJobFor("review", id);
  if (already) return apiError("Feedback is already being written for this meeting.", 409, { extra: { jobId: already.id } });
  const job = await enqueue({ kind: "review", meetingId: id, params: { role, person } });
  void tick();
  return NextResponse.json({ status: "queued", jobId: job.id }, { status: 202 });
}
