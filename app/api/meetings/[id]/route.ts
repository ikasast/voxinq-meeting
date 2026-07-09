import { NextRequest, NextResponse } from "next/server";
import { apiError, readJson } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { isValidSpeakerKey } from "@/lib/speakers";
import { sttHttpBase } from "@/lib/stt/client";
import { pruneOrphanTags } from "@/lib/tags";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const meeting = await prisma.meeting.findUnique({
    where: { id },
    include: {
      transcripts: { orderBy: { createdAt: "asc" } },
      summaries: { orderBy: { createdAt: "desc" } },
    },
  });
  return meeting ? NextResponse.json(meeting) : apiError("not found", 404);
}

// Partially update a meeting's metadata.
// - title: rename the meeting
// - description: meeting purpose/contents (empty string resets to unset)
// - tags: array of tag names (full replace; unknown names are created as new tags)
// - speakerLabels: update speaker display names (speaker key -> display name)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await readJson<{
    title?: unknown;
    description?: unknown;
    tags?: unknown;
    speakerLabels?: unknown;
  }>(req);

  const data: {
    title?: string;
    description?: string | null;
    speakerLabels?: string;
    tags?: { set: []; connectOrCreate: { where: { name: string }; create: { name: string } }[] };
  } = {};

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

  if (body?.speakerLabels !== undefined) {
    const raw = body.speakerLabels;
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
      return apiError("invalid speakerLabels", 400);
    }
    // Accept only valid speaker keys with a non-empty string value.
    const cleaned: Record<string, string> = {};
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      if (isValidSpeakerKey(key) && typeof value === "string" && value.trim()) {
        cleaned[key] = value.trim();
      }
    }
    data.speakerLabels = JSON.stringify(cleaned);
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
        tags: { select: { name: true }, orderBy: { name: "asc" } },
      },
    });
    // After re-tagging, clean up tags no longer attached to any meeting.
    if (data.tags) await pruneOrphanTags();
    return NextResponse.json({ ...updated, tags: updated.tags.map((t) => t.name) });
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
  // Tags that were attached only to this meeting become orphans, so clean them up.
  await pruneOrphanTags();
  // Also delete the recording (WAV, etc.) on the GPU host. Best-effort: even if STT is
  // unreachable, the meeting delete still succeeds (recordings auto-delete on retention).
  try {
    await fetch(`${sttHttpBase()}/recordings/${id}`, {
      method: "DELETE",
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // ignore
  }
  return NextResponse.json({ ok: true });
}
