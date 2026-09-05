import { NextResponse } from "next/server";
import { isLastAdmin, requireAdmin } from "@/lib/auth/admin";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

// Disabling an account, and making or unmaking an administrator.
//
// **There is no delete.** An account holds meetings, and deleting one would either destroy them
// or hand them to somebody who was never in the room. Disabling stops the login and leaves
// everything where it is — reversible, and it cannot quietly lose a year of recordings.
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.res;
  const { id } = await ctx.params;

  const body = (await req.json().catch(() => null)) as {
    disabled?: unknown;
    isAdmin?: unknown;
  } | null;
  if (!body) return NextResponse.json({ error: "invalid body" }, { status: 400 });

  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, isAdmin: true, disabledAt: true, username: true },
  });
  if (!target) return NextResponse.json({ error: "no such account" }, { status: 404 });

  const data: { disabledAt?: Date | null; isAdmin?: boolean } = {};

  if (typeof body.disabled === "boolean") {
    if (body.disabled && target.id === guard.me.id) {
      // Not a rule about permissions — a rule about locking yourself out of the room you are
      // standing in.
      return NextResponse.json(
        { error: "You cannot disable your own account." },
        { status: 400 },
      );
    }
    if (body.disabled && target.isAdmin && (await isLastAdmin(target.id))) {
      return NextResponse.json(
        { error: "That is the only administrator. Make somebody else one first." },
        { status: 400 },
      );
    }
    data.disabledAt = body.disabled ? new Date() : null;
  }

  if (typeof body.isAdmin === "boolean") {
    if (!body.isAdmin && (await isLastAdmin(target.id))) {
      return NextResponse.json(
        { error: "That is the only administrator. Make somebody else one first." },
        { status: 400 },
      );
    }
    data.isAdmin = body.isAdmin;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "nothing to change" }, { status: 400 });
  }

  await prisma.user.update({ where: { id }, data });
  // Disabling has to end the sessions too, or the person stays signed in until their cookie
  // expires — which would make "disabled" mean "cannot sign in again", not "is out".
  if (data.disabledAt) await prisma.session.deleteMany({ where: { userId: id } });
  return NextResponse.json({ ok: true });
}
