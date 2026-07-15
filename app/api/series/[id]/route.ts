import { NextRequest, NextResponse } from "next/server";
import { apiError, readJson } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const series = await prisma.series.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      summaryFormat: true,
      sttGlossary: true,
      _count: { select: { meetings: { where: { deletedAt: null } } } },
    },
  });
  return series ? NextResponse.json(series) : apiError("not found", 404);
}

// Update a series: rename, and per-series defaults (minutes format / STT glossary).
// Empty strings clear a default back to "use the global setting".
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await readJson<{ name?: unknown; summaryFormat?: unknown; sttGlossary?: unknown }>(
    req,
  );

  const data: { name?: string; summaryFormat?: string | null; sttGlossary?: string | null } = {};

  if (body?.name !== undefined) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return apiError("name is required", 400);
    if (name.length > 60) return apiError("name too long (max 60)", 400);
    data.name = name;
  }
  if (body?.summaryFormat !== undefined) {
    if (body.summaryFormat !== null && typeof body.summaryFormat !== "string") {
      return apiError("invalid summaryFormat", 400);
    }
    data.summaryFormat =
      (typeof body.summaryFormat === "string" && body.summaryFormat.trim()) || null;
  }
  if (body?.sttGlossary !== undefined) {
    if (body.sttGlossary !== null && typeof body.sttGlossary !== "string") {
      return apiError("invalid sttGlossary", 400);
    }
    data.sttGlossary = (typeof body.sttGlossary === "string" && body.sttGlossary.trim()) || null;
  }
  if (Object.keys(data).length === 0) return apiError("no valid fields", 400);

  try {
    const updated = await prisma.series.update({
      where: { id },
      data,
      select: { id: true, name: true, summaryFormat: true, sttGlossary: true },
    });
    return NextResponse.json(updated);
  } catch (e) {
    // Unique name collision (another series already has this name).
    if (e && typeof e === "object" && "code" in e && e.code === "P2002") {
      return apiError("a series with this name already exists", 409);
    }
    return apiError("not found", 404);
  }
}
