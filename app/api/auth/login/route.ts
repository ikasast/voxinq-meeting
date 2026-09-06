import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { AUTH_COOKIE, expectedAuthToken } from "@/lib/auth-token";
import { SESSION_COOKIE, SESSION_TTL_MS } from "@/lib/auth/cookie";
import { normaliseEmail } from "@/lib/auth/email";
import { hasUsersCached } from "@/lib/auth/has-users";
import { verifyPassword } from "@/lib/auth/password";
import { pruneSessions, startSession } from "@/lib/auth/session";
import { unlockWithPassword } from "@/lib/crypto/user-keys";
import { enqueueEncryptionIfNeeded } from "@/lib/crypto/migrate";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

// Signing in, both ways round.
//
// With accounts, a username and a password. Without any, the shared APP_PASSWORD this app used
// before v3.1 — unchanged, so upgrading does not sign anybody out of their own server.

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    email?: unknown;
    password?: unknown;
  } | null;
  const password = typeof body?.password === "string" ? body.password : null;
  if (!password) return apiError("Wrong password", 401);

  if (!(await hasUsersCached())) {
    const shared = process.env.APP_PASSWORD;
    if (!shared) {
      return apiError("Auth is disabled (APP_PASSWORD not set)", 400);
    }
    if (password !== shared) return apiError("Wrong password", 401);
    const res = NextResponse.json({ ok: true });
    res.cookies.set(AUTH_COOKIE, (await expectedAuthToken())!, cookieOptions());
    return res;
  }

  // The address, because it is the one identifier somebody already knows about themselves. The
  // username is still there — it is the short handle the avatar URL is built from — but nobody
  // should have to remember which of `sam`, `sam2` or `sasaki.tkfm` the server picked for them.
  const email = typeof body?.email === "string" ? normaliseEmail(body.email) : "";
  const user = email
    ? await prisma.user.findUnique({
        where: { email },
        select: { id: true, passwordHash: true, disabledAt: true },
      })
    : null;

  // One message for every way of being wrong. Saying "no such account" turns the login form into
  // a way to ask who is on this server.
  if (!user || user.disabledAt || !(await verifyPassword(password, user.passwordHash))) {
    return apiError("Wrong email or password", 401);
  }

  // Signing in is the one moment the password exists in this process, so it is the only moment
  // the key can be opened. Failing to open it is not a failed login — an account may simply have
  // no key yet — so nothing here depends on the result.
  const master = await unlockWithPassword(user.id, password);

  // Everything recorded before this account had a key is still in the clear. Encrypting it is
  // queued rather than done here: somebody with two years of meetings should not watch a login
  // spinner while a hundred thousand rows are rewritten, and the queue already knows how to
  // show it, survive a restart, and hold the key for exactly as long as the work lasts.
  if (master) await enqueueEncryptionIfNeeded(user.id);

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
