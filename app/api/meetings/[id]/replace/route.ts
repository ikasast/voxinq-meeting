import { NextRequest, NextResponse } from "next/server";
import { apiError, readJson } from "@/lib/api";
import { planReplace } from "@/lib/find-replace";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

// Find and replace across one meeting's transcript — for a term the recogniser got wrong the
// same way in every utterance, which is otherwise a row-at-a-time chore.
//
// POST with `dryRun` to preview: the same planning code runs, nothing is written, and the
// caller gets the rows that would change. The UI uses that for the confirmation step.
//
// Safe for diarization: speakers map onto utterances by position and rewriting text moves
// nothing (unlike deleting a row, which also has to drop the matching recording boundary).
// A replacement that would empty a row is refused rather than turned into a deletion.
export async function POST(req: NextRequest, ctx: RouteContext<"/api/meetings/[id]/replace">) {
  const { id } = await ctx.params;

  const body = await readJson<{
    find?: unknown;
    replace?: unknown;
    caseSensitive?: unknown;
    dryRun?: unknown;
  }>(req);

  const find = typeof body?.find === "string" ? body.find : "";
  if (!find) return apiError("find is required", 400);
  // Replacing with nothing is deletion by another name; the plan refuses rows it would empty,
  // but an empty replacement across the board is more likely a mistake than an intent.
  const replace = typeof body?.replace === "string" ? body.replace : "";
  const caseSensitive = body?.caseSensitive === true;
  const dryRun = body?.dryRun === true;

  const meeting = await prisma.meeting.findUnique({ where: { id }, select: { id: true } });
  if (!meeting) return apiError("meeting not found", 404);

  // Read the rows here rather than trusting anything the browser computed: a tab left open
  // while someone edited a line would otherwise write back the text it remembers.
  const rows = await prisma.transcript.findMany({
    where: { meetingId: id },
    orderBy: { createdAt: "asc" },
    select: { id: true, text: true },
  });

  const plan = planReplace(rows, find, replace, { caseSensitive });

  if (dryRun) {
    return NextResponse.json({
      matchedRows: plan.matchedRows,
      totalMatches: plan.totalMatches,
      // Enough to show a preview without shipping the whole transcript back.
      changes: plan.changes.slice(0, 200),
      changeCount: plan.changes.length,
      skipped: plan.skipped,
    });
  }

  if (plan.changes.length === 0) {
    return NextResponse.json({ updated: 0, skipped: plan.skipped, totalMatches: plan.totalMatches });
  }

  await prisma.$transaction(
    plan.changes.map((c) =>
      prisma.transcript.update({ where: { id: c.id }, data: { text: c.after } }),
    ),
  );

  return NextResponse.json({
    updated: plan.changes.length,
    totalMatches: plan.totalMatches,
    skipped: plan.skipped,
  });
}
