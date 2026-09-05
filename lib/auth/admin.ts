import { NextResponse } from "next/server";
import { currentUser, type CurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

// The checks an administrator route makes before doing anything.
//
// Kept here rather than repeated, because they are the kind of thing that gets written slightly
// differently in each route and then one of them is written wrongly.

export type AdminGuard = { ok: true; me: CurrentUser } | { ok: false; res: NextResponse };

export async function requireAdmin(): Promise<AdminGuard> {
  const me = await currentUser();
  if (!me) {
    return { ok: false, res: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  }
  if (!me.isAdmin) {
    return { ok: false, res: NextResponse.json({ error: "not an administrator" }, { status: 403 }) };
  }
  return { ok: true, me };
}

/**
 * Would this leave the server with nobody who can administer it?
 *
 * The last administrator cannot be demoted or disabled. There is no password to recover with
 * and no console to fix it from — an instance in that state is one whose settings, accounts and
 * queue nobody can touch again, and the only way out is editing the database by hand.
 */
export async function isLastAdmin(userId: string): Promise<boolean> {
  const others = await prisma.user.count({
    where: { isAdmin: true, disabledAt: null, id: { not: userId } },
  });
  return others === 0;
}
