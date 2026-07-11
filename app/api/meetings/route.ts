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

  const tagNames =
    Array.isArray(body?.tags) && body.tags.every((t) => typeof t === "string")
      ? [...new Set((body.tags as string[]).map((t) => t.trim()).filter(Boolean))].slice(0, 10)
      : [];

  const seriesName =
    typeof body?.series === "string" ? body.series.trim().slice(0, 60) : "";

  const created = await prisma.meeting.create({
    data: {
      title,
      description,
      sttLanguage,
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
