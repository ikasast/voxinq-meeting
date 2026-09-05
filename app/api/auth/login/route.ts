import { NextResponse } from "next/server";
import { AUTH_COOKIE, expectedAuthToken } from "@/lib/auth-token";
import { SESSION_COOKIE, SESSION_TTL_MS } from "@/lib/auth/cookie";
import { hasUsersCached } from "@/lib/auth/has-users";
import { verifyPassword } from "@/lib/auth/password";
import { pruneSessions, startSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

// Signing in, both ways round.
//
// With accounts, a username and a password. Without any, the shared APP_PASSWORD this app used
// before v3.1 — unchanged, so upgrading does not sign anybody out of their own server.

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    username?: unknown;
    password?: unknown;
  } | null;
  const password = typeof body?.password === "string" ? body.password : null;
  if (!password) return NextResponse.json({ error: "Wrong password" }, { status: 401 });

  if (!(await hasUsersCached())) {
    const shared = process.env.APP_PASSWORD;
    if (!shared) {
      return NextResponse.json({ error: "Auth is disabled (APP_PASSWORD not set)" }, { status: 400 });
    }
    if (password !== shared) return NextResponse.json({ error: "Wrong password" }, { status: 401 });
    const res = NextResponse.json({ ok: true });
    res.cookies.set(AUTH_COOKIE, (await expectedAuthToken())!, cookieOptions());
    return res;
  }

  const username = typeof body?.username === "string" ? body.username.trim().toLowerCase() : "";
  const user = username
    ? await prisma.user.findUnique({
        where: { username },
        select: { id: true, passwordHash: true, disabledAt: true },
      })
    : null;

  // One message for every way of being wrong. Saying "no such user" turns the login form into
  // a way to ask who has an account here.
  if (!user || user.disabledAt || !(await verifyPassword(password, user.passwordHash))) {
    return NextResponse.json({ error: "Wrong username or password" }, { status: 401 });
  }

  await pruneSessions();
  const ua = req.headers.get("user-agent");
  const { value, expiresAt } = await startSession(user.id, ua);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, value, { ...cookieOptions(), expires: expiresAt });
  return res;
}

function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  };
}
