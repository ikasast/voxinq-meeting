import { NextRequest, NextResponse } from "next/server";
import { extensionEnabled } from "@/lib/extensions-store";
import { extensionOff } from "@/app/api/extension-off";
import { apiError, readJson } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { isExternalRequest } from "@/lib/is-tailnet";
import { namesFromRequest } from "@/lib/speakers";
import { applySeriesMembers, pruneOrphanSeries, seriesIdForName } from "@/lib/series";
import { pruneOrphanTags } from "@/lib/tags";
import { deleteRecording } from "@/lib/trash";
import { RECORDING_KIND } from "@/lib/queue/types";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const meeting = await prisma.meeting.findUnique({
    where: { id },
    include: {
      transcripts: { orderBy: { createdAt: "asc" } },
      summaries: { orderBy: { createdAt: "desc" } },
      // Read by the recorder for the series' glossary, which is not used without Series.
      series: (await extensionEnabled("series")) ? { select: { id: true, name: true, sttGlossary: true } } : false,
    },
  });
  return meeting ? NextResponse.json(meeting) : apiError("not found", 404);
}

// Partially update a meeting's metadata.
// - title: rename the meeting
// - description: meeting purpose/contents (empty string resets to unset)
// - tags: array of tag names (full replace; unknown names are created as new tags)
// - series: series name (created if new; null/"" detaches from the series)
// - speakerLabels: update speaker display names (speaker key -> display name)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await readJson<{
    title?: unknown;
    description?: unknown;
    tags?: unknown;
    series?: unknown;
    speakerLabels?: unknown;
    archived?: unknown;
    scheduledAt?: unknown;
  }>(req);

  // From outside the private network this route is open so a meeting can be *set up* — its
  // title, agenda, series and tags. The same route also archives and renames speakers, and
  // neither is setting a meeting up: archiving takes something off the list, and speaker names
  // belong to a transcript that was made in here. Refused rather than ignored, so a caller
  // that tries is told, not left thinking it worked.
  if (await isExternalRequest()) {
    for (const field of ["archived", "speakerLabels"] as const) {
      if (body?.[field] !== undefined) {
        return apiError(`${field} cannot be changed from outside your private network`, 403);
      }
    }
  }

  const data: {
    title?: string;
    description?: string | null;
    speakerLabels?: string;
    archivedAt?: Date | null;
    tags?: { set: []; connectOrCreate: { where: { name: string }; create: { name: string } }[] };
    series?: { connect: { id: string } } | { disconnect: true };
    scheduledAt?: Date;
    startedAt?: Date;
  } = {};

  if (body?.archived !== undefined) {
    // Archive hides a meeting from the list but keeps it in the DB (still searchable).
    data.archivedAt = body.archived ? new Date() : null;
  }

  if (body?.title !== undefined) {
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title) return apiError("title is required", 400);
    if (title.length > 200) return apiError("title must be 200 chars or fewer", 400);
    data.title = title;
  }

  if (body?.description !== undefined) {
    if (body.description !== null && typeof body.description !== "string") {
      return apiError("invalid description", 400);
    }
    data.description = (typeof body.description === "string" && body.description.trim()) || null;
  }

  if (body?.tags !== undefined) {
    if (!Array.isArray(body.tags) || !body.tags.every((t) => typeof t === "string")) {
      return apiError("invalid tags", 400);
    }
    // Trim + dedupe. Names up to 30 chars, up to 10 tags.
    const names = [...new Set(body.tags.map((t) => t.trim()).filter(Boolean))];
    if (names.length > 10) return apiError("too many tags (max 10)", 400);
    if (names.some((n) => n.length > 30)) return apiError("tag name too long (max 30)", 400);
    data.tags = {
      set: [],
      connectOrCreate: names.map((name) => ({ where: { name }, create: { name } })),
    };
  }

  // Not while Series is switched off: the screen does not offer it, and a meeting keeps the
  // series it had for when it comes back.
  if (body?.series !== undefined && (await extensionEnabled("series"))) {
    if (body.series !== null && typeof body.series !== "string") {
      return apiError("invalid series", 400);
    }
    const name = typeof body.series === "string" ? body.series.trim() : "";
    if (name.length > 60) return apiError("series name too long (max 60)", 400);
    // The caller's own series of that name: see seriesIdForName.
    data.series = name ? { connect: { id: await seriesIdForName(name) } } : { disconnect: true };
  }

  if (body?.speakerLabels !== undefined) {
    const names = namesFromRequest(body.speakerLabels);
    if (!names) return apiError("invalid speakerLabels", 400);
    data.speakerLabels = JSON.stringify(names);
  }

  // Moving a booked meeting to another time. Only while it is still only a booking: once it has
  // been recorded, its times come from the recording, and a line's time is reconstructed as
  // "meeting start + its offset", so moving the start would move every line with it. A meeting
  // that is being recorded right now has no lines yet and no end, and is refused by its hold on
  // the card. Open from outside like the rest of setting a meeting up, as booking it is.
  //
  // `startedAt` moves too: a booked meeting carries its diary time there until it is recorded,
  // which is what the list and the page show (see POST /api/meetings).
  if (body?.scheduledAt !== undefined) {
    const off = await extensionOff("schedule");
    if (off) return off;
    if (typeof body.scheduledAt !== "string" || !body.scheduledAt.trim()) {
      return apiError("scheduledAt is not a date", 400);
    }
    const at = new Date(body.scheduledAt);
    if (Number.isNaN(at.getTime())) return apiError("scheduledAt is not a date", 400);
    const current = await prisma.meeting.findUnique({
      where: { id },
      select: { scheduledAt: true, endedAt: true, _count: { select: { transcripts: true } } },
    });
    if (!current) return apiError("not found", 404);
    const recording = await prisma.job.findFirst({
      where: { kind: RECORDING_KIND, meetingId: id, status: "running" },
      select: { id: true },
    });
    if (
      current.scheduledAt === null ||
      current.endedAt !== null ||
      current._count.transcripts > 0 ||
      recording
    ) {
      return apiError("Only a booked meeting that has not been recorded yet can be moved.", 409);
    }
    data.scheduledAt = at;
    data.startedAt = at;
  }

  if (Object.keys(data).length === 0) return apiError("no valid fields", 400);

  try {
    const updated = await prisma.meeting.update({
      where: { id },
      data,
      select: {
        id: true,
        title: true,
        description: true,
        speakerLabels: true,
        archivedAt: true,
        tags: { select: { name: true }, orderBy: { name: "asc" } },
        series: { select: { id: true, name: true } },
      },
    });
    // Filed under a series it was not in before: give it the regular members, unless somebody
    // has already said who was there. `applySeriesMembers` is what decides that.
    if (data.series && updated.series) await applySeriesMembers(updated.id, updated.series.id);
    // After re-tagging/reassigning, clean up tags/series no longer attached to any meeting.
    if (data.tags) await pruneOrphanTags();
    if (data.series) await pruneOrphanSeries();
    return NextResponse.json({
      ...updated,
      tags: updated.tags.map((t) => t.name),
      series: updated.series?.name ?? null,
    });
  } catch {
    return apiError("not found", 404);
  }
}

// Soft delete (to trash) by default. ?permanent=1 for a full delete (also removes recordings).
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const permanent = new URL(req.url).searchParams.get("permanent") === "1";

  if (!permanent) {
    try {
      await prisma.meeting.update({ where: { id }, data: { deletedAt: new Date() } });
    } catch {
      return apiError("not found", 404);
    }
    return NextResponse.json({ ok: true, trashed: true });
  }

  // Full delete: transcripts / summaries are removed together via onDelete: Cascade in the schema.
  try {
    await prisma.meeting.delete({ where: { id } });
  } catch {
    return apiError("not found", 404);
  }
  // Tags/series that were attached only to this meeting become orphans, so clean them up.
  await pruneOrphanTags();
  await pruneOrphanSeries();
  // Also delete the recording (WAV, etc.) on the STT service. Best-effort: even if STT is
  // unreachable, the meeting delete still succeeds (unprotected recordings go on retention).
  await deleteRecording(id);
  return NextResponse.json({ ok: true });
}
