import { NextResponse } from "next/server";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { currentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

// Setting your own password.
//
// An account created from a tailnet identity has none: inside the tailnet nobody is ever asked
// for one. It needs one to be reachable from anywhere else — which is exactly the case this
// route exists for, and why it can be used by somebody who has no current password to give.

const MIN_PASSWORD = 8;

export async function POST(req: Request) {
  const me = await currentUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    current?: unknown;
    password?: unknown;
  } | null;
  const password = typeof body?.password === "string" ? body.password : "";
  if (password.length < MIN_PASSWORD) {
    return NextResponse.json({ error: `Use at least ${MIN_PASSWORD} characters.` }, { status: 400 });
  }

  const existing = await prisma.user.findUniqueOrThrow({
    where: { id: me.id },
    select: { passwordHash: true },
  });

  // Changing a password you have needs the old one — otherwise a borrowed unlocked browser is
  // a permanent account takeover rather than a session that eventually expires. Setting a first
  // one does not, because there is nothing to prove and being identified is the proof.
  if (existing.passwordHash) {
    const current = typeof body?.current === "string" ? body.current : "";
    if (!(await verifyPassword(current, existing.passwordHash))) {
      return NextResponse.json({ error: "That is not your current password." }, { status: 403 });
    }
  }

  await prisma.user.update({
    where: { id: me.id },
    data: { passwordHash: await hashPassword(password) },
  });
  return NextResponse.json({ ok: true, hadPassword: Boolean(existing.passwordHash) });
}

/** Sign out everywhere. The point of server-side sessions: a lost phone can be cut off. */
export async function DELETE() {
  const me = await currentUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { count } = await prisma.session.deleteMany({ where: { userId: me.id } });
  return NextResponse.json({ ok: true, ended: count });
}
