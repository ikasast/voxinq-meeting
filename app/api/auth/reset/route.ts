import { NextResponse } from "next/server";
import { SESSION_COOKIE, SESSION_TTL_MS } from "@/lib/auth/cookie";
import { hashPassword } from "@/lib/auth/password";
import { consumeReset } from "@/lib/auth/reset";
import { startSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const MIN_PASSWORD = 8;

// Spend a reset link and set a password.
//
// Reachable while signed out, because somebody who could sign in would not need it. The link
// itself is the proof, which is why it is short-lived and single-use.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    token?: unknown;
    password?: unknown;
  } | null;
  const token = typeof body?.token === "string" ? body.token : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (password.length < MIN_PASSWORD) {
    return NextResponse.json({ error: `Use at least ${MIN_PASSWORD} characters.` }, { status: 400 });
  }

  const spent = await consumeReset(token);
  if (!spent) {
    return NextResponse.json(
      { error: "That link has expired or has already been used. Ask for another." },
      { status: 400 },
    );
  }

  await prisma.user.update({
    where: { id: spent.userId },
    data: { passwordHash: await hashPassword(password) },
  });
  // Every other session ends. If the reason for the reset was that somebody else had the
  // account, leaving their browser signed in would make the whole exercise pointless.
  await prisma.session.deleteMany({ where: { userId: spent.userId } });

  const { value, expiresAt } = await startSession(spent.userId, req.headers.get("user-agent"));
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
    expires: expiresAt,
  });
  return res;
}
