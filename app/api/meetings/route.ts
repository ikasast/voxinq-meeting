import { NextRequest, NextResponse } from "next/server";
import { apiError, readJson } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const TITLE_MAX = 200;

export async function GET() {
  const meetings = await prisma.meeting.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return NextResponse.json(meetings);
}

const STT_LANGS = ["auto", "ja", "en"];

// Create a meeting. title is required; description/tags/series/sttLanguage are optional.
// tags/series are accepted so "new with same settings" can carry over the metadata.
export async function POST(req: NextRequest) {
  const body = await readJson<{
    title?: unknown;
    description?: unknown;
    tags?: unknown;
    series?: unknown;
    sttLanguage?: unknown;
    whisperModel?: unknown;
    scheduledAt?: unknown;
  }>(req);

  const title = typeof body?.title === "string" ? body.title.trim() : "";
  if (!title) return apiError("title is required", 400);
  if (title.length > TITLE_MAX) return apiError(`title must be ${TITLE_MAX} chars or fewer`, 400);

  const description =
    typeof body?.description === "string" ? body.description.trim() || null : null;

  // null / unspecified / "auto" means "follow the settings default"; store null in the DB.
  const sttLanguage =
    typeof body?.sttLanguage === "string" && STT_LANGS.includes(body.sttLanguage) && body.sttLanguage !== "auto"
      ? body.sttLanguage
      : null;

  // The transcription model chosen for this meeting. Stored on the meeting so it survives a
  // reload of the recording screen — carrying it only in the URL meant re-entering that screen
  // silently fell back to the settings default, and the meeting was recorded with that instead.
  const whisperModel =
    typeof body?.whisperModel === "string" && body.whisperModel.trim()
      ? body.whisperModel.trim().slice(0, 120)
      : null;

  const tagNames =
    Array.isArray(body?.tags) && body.tags.every((t) => typeof t === "string")
      ? [...new Set((body.tags as string[]).map((t) => t.trim()).filter(Boolean))].slice(0, 10)
      : [];

  const seriesName =
    typeof body?.series === "string" ? body.series.trim().slice(0, 60) : "";

  // A meeting put in the diary before it happens. `startedAt` is set to the same moment so the
  // date shown everywhere is the meeting's own; it is corrected to the real one when the
  // recording ends, which is when a true start time first exists.
  let scheduledAt: Date | undefined;
  if (typeof body?.scheduledAt === "string" && body.scheduledAt.trim()) {
    const d = new Date(body.scheduledAt);
    if (Number.isNaN(d.getTime())) return apiError("scheduledAt is not a date", 400);
    scheduledAt = d;
  }

  const created = await prisma.meeting.create({
    data: {
      title,
      description,
      sttLanguage,
      whisperModel,
      ...(scheduledAt ? { scheduledAt, startedAt: scheduledAt } : {}),
      tags: tagNames.length
        ? { connectOrCreate: tagNames.map((name) => ({ where: { name }, create: { name } })) }
        : undefined,
      series: seriesName
        ? { connectOrCreate: { where: { name: seriesName }, create: { name: seriesName } } }
        : undefined,
    },
  });
  return NextResponse.json(created, { status: 201 });
}
