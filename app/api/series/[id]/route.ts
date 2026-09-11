import { NextRequest, NextResponse } from "next/server";
import { apiError, readJson } from "@/lib/api";
import { currentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/** Long enough for the background of a project, short enough not to become the minutes. */
const DESCRIPTION_MAX = 4000;
const MEMBERS_MAX = 50;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const series = await prisma.series.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      summaryFormat: true,
      sttGlossary: true,
      description: true,
      members: { orderBy: [{ position: "asc" }, { createdAt: "asc" }], select: { name: true } },
      // Named explicitly: a `where` nested inside a `_count` is not rewritten by the scoped
      // client, so without this the number counts everybody's meetings in the series.
      _count: { select: { meetings: { where: { deletedAt: null, ...(await onlyMine()) } } } },
    },
  });
  return series ? NextResponse.json(series) : apiError("not found", 404);
}

/** `{ ownerId }` when this instance has accounts, `{}` when it does not. */
async function onlyMine(): Promise<{ ownerId?: string }> {
  const me = await currentUser();
  return me ? { ownerId: me.id } : {};
}

/**
 * Update a series: rename, the per-series defaults, the shared background, the regular members.
 *
 * Empty strings clear a default back to "use the global setting". `members` is replaced whole
 * rather than patched — it is a short list edited as a list, and the same shape the meeting's
 * own participants use.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await readJson<{
    name?: unknown;
    summaryFormat?: unknown;
    sttGlossary?: unknown;
    description?: unknown;
    members?: unknown;
  }>(req);

  const data: {
    name?: string;
    summaryFormat?: string | null;
    sttGlossary?: string | null;
    description?: string | null;
  } = {};

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
  if (body?.description !== undefined) {
    if (body.description !== null && typeof body.description !== "string") {
      return apiError("invalid description", 400);
    }
    const text = typeof body.description === "string" ? body.description.trim() : "";
    if (text.length > DESCRIPTION_MAX) {
      return apiError("The shared background is too long.", 400);
    }
    data.description = text || null;
  }

  // Members are optional and separate: a rename with no `members` key must not empty the list.
  let members: string[] | undefined;
  if (body?.members !== undefined) {
    if (!Array.isArray(body.members)) return apiError("invalid members", 400);
    if (body.members.length > MEMBERS_MAX) {
      return apiError("That is more regular members than a series can have.", 400);
    }
    const seen = new Set<string>();
    members = [];
    for (const raw of body.members) {
      const name = typeof raw === "string" ? raw.trim().slice(0, 80) : "";
      if (!name || seen.has(name)) continue;
      seen.add(name);
      members.push(name);
    }
  }

  if (Object.keys(data).length === 0 && members === undefined) {
    return apiError("no valid fields", 400);
  }

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const row =
        Object.keys(data).length > 0
          ? await tx.series.update({ where: { id }, data, select: { id: true } })
          : await tx.series.findUniqueOrThrow({ where: { id }, select: { id: true } });
      if (members !== undefined) {
        await tx.seriesMember.deleteMany({ where: { seriesId: row.id } });
        if (members.length > 0) {
          await tx.seriesMember.createMany({
            data: members.map((name, position) => ({ seriesId: row.id, name, position })),
          });
        }
      }
      return tx.series.findUniqueOrThrow({
        where: { id: row.id },
        select: {
          id: true,
          name: true,
          summaryFormat: true,
          sttGlossary: true,
          description: true,
          members: {
            orderBy: [{ position: "asc" }, { createdAt: "asc" }],
            select: { name: true },
          },
        },
      });
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

/**
 * Removing a series nobody is using.
 *
 * Refused while any meeting is filed under it, trashed ones included: deleting a series is not a
 * way to un-file meetings, and a meeting restored from the trash should come back into its
 * series. The count is a `_count`, which the scoped client does not narrow — so it is everybody's
 * meetings, not only the caller's, and nobody's series disappears from under them.
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const series = await prisma.series.findUnique({
    where: { id },
    select: { id: true, _count: { select: { meetings: true } } },
  });
  if (!series) return apiError("not found", 404);
  if (series._count.meetings > 0) {
    return apiError("Only a series with no meetings in it can be deleted.", 409);
  }
  await prisma.series.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
