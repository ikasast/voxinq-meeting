import { NextResponse, type NextRequest } from "next/server";
import { apiError, readJson } from "@/lib/api";
import { currentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `{ ownerId }` when this instance has accounts, `{}` when it does not. */
async function onlyMine(): Promise<{ ownerId?: string }> {
  const me = await currentUser();
  return me ? { ownerId: me.id } : {};
}

/**
 * The series, for the pickers and for the series list.
 *
 * Series are created implicitly when a meeting is filed under a new name, and pruned when their
 * last meeting goes — unless created on their own by the POST below. The two pickers that consume this read `name` and nothing else, so the
 * extra fields below are additive — there for the list page, ignored by them.
 *
 * The counts have to say `ownerId` themselves: a `where` nested inside a `_count` is not
 * rewritten by the scoped client, so without it the number would count everybody's meetings.
 */
export async function GET() {
  const mine = await onlyMine();
  const rows = await prisma.series.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      description: true,
      summaryFormat: true,
      sttGlossary: true,
      _count: {
        select: {
          meetings: { where: { deletedAt: null, ...mine } },
          members: true,
        },
      },
      // The most recent meeting decides the order the list is actually useful in — a series
      // nobody has met about in a year should not sit above this week's.
      meetings: {
        where: { deletedAt: null, ...mine },
        orderBy: { startedAt: "desc" },
        take: 1,
        select: { startedAt: true },
      },
    },
  });

  return NextResponse.json(
    rows.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      hasFormat: Boolean(s.summaryFormat?.trim()),
      hasGlossary: Boolean(s.sttGlossary?.trim()),
      meetings: s._count.meetings,
      members: s._count.members,
      lastMetAt: s.meetings[0]?.startedAt?.toISOString() ?? null,
    })),
  );
}

/**
 * A series set up on its own, before anything is filed under it — so its background and regular
 * members can be written before the first meeting rather than after it.
 *
 * `standalone` keeps it while it has no meetings, and `ownerId` is what lets the person who made
 * it see it then: a series is otherwise visible through its meetings, and this one has none.
 */
export async function POST(req: NextRequest) {
  const body = await readJson<{ name?: unknown }>(req);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) return apiError("Enter a name for the series.", 400);
  if (name.length > 60) return apiError("name too long (max 60)", 400);
  const me = await currentUser();
  try {
    const created = await prisma.series.create({
      data: { name, standalone: true, ownerId: me?.id ?? null },
      select: { id: true, name: true },
    });
    return NextResponse.json(created, { status: 201 });
  } catch (e) {
    // Names are unique across the instance, not per person: a meeting's series field connects to
    // an existing series by name, and has always worked that way.
    if ((e as { code?: string }).code === "P2002") {
      return apiError("A series with that name already exists.", 409);
    }
    throw e;
  }
}
