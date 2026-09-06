import { NextResponse } from "next/server";
import { SESSION_COOKIE, SESSION_TTL_MS } from "@/lib/auth/cookie";
import { currentUser, startSession } from "@/lib/auth/session";
import { enqueueEncryptionIfNeeded } from "@/lib/crypto/migrate";
import { unlockWithPassword } from "@/lib/crypto/user-keys";

export const runtime = "nodejs";

// Opening your own key without signing in again.
//
// Needed because being identified and being able to read are two different things here, and
// inside a tailnet only the first ever happens. The identity header says who you are; it carries
// no secret, and the key is wrapped by one. So there has to be a moment where the password is
// asked for on its own — not to prove who you are, which is already settled, but to hand over
// the thing that opens the data.
//
// It starts a session as well, and that is not incidental. A tailnet visit creates no session
// row — the header is enough to say who you are on every request — so without one there is
// nothing for the key's lifetime to hang from, and it would be dropped fifteen minutes after
// the last read: unlock, work, make a cup of tea, locked again. Somebody who has just proved
// their password has done the thing a sign-in is for, so this browser gets a session, and
// signing out is what closes the key again.
export async function POST(req: Request) {
  const me = await currentUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { password?: unknown } | null;
  const password = typeof body?.password === "string" ? body.password : "";
  if (!password) return NextResponse.json({ error: "Enter your password." }, { status: 400 });

  const master = await unlockWithPassword(me.id, password);
  if (!master) {
    // The same message whether the password is wrong or the account has no key at all. The
    // second cannot happen from the screen that calls this — it only appears when there *is* a
    // key — and spelling out which it was would say something about the account to whoever is
    // guessing.
    return NextResponse.json({ error: "That is not your password." }, { status: 403 });
  }

  // Anything recorded before this account had a key, or left behind by an interrupted pass. The
  // key is open now, which is the condition that walk has been waiting for.
  await enqueueEncryptionIfNeeded(me.id);

  const { value, expiresAt } = await startSession(me.id, req.headers.get("user-agent"));
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
