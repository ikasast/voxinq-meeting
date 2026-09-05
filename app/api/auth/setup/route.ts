import { NextResponse } from "next/server";
import { SESSION_COOKIE, SESSION_TTL_MS } from "@/lib/auth/cookie";
import { adoptOrphanedMeetings } from "@/lib/auth/adopt";
import { forgetUserCount, hasUsersCached } from "@/lib/auth/has-users";
import { hashPassword } from "@/lib/auth/password";
import { startSession } from "@/lib/auth/session";
import { setUpKey } from "@/lib/crypto/user-keys";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

// Creating the first account.
//
// Open only while there are none. After that it is closed for good and further accounts are an
// administrator's job — an endpoint that makes admins is not something to leave lying about
// because it happened to be needed once.
//
// It does not ask for APP_PASSWORD: the proxy has already refused this request unless it
// carried the shared password or arrived through the tailnet, so whoever reaches here is
// already inside. Asking again would only be a second copy of the same check.

const USERNAME = /^[a-z0-9._-]{2,32}$/;
const MIN_PASSWORD = 8;

export async function POST(req: Request) {
  if (await hasUsersCached()) {
    return NextResponse.json(
      { error: "This server already has an account. Sign in, or ask an administrator." },
      { status: 409 },
    );
  }

  const body = (await req.json().catch(() => null)) as {
    username?: unknown;
    password?: unknown;
    name?: unknown;
  } | null;
  const username = typeof body?.username === "string" ? body.username.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const name = typeof body?.name === "string" ? body.name.trim() : "";

  if (!USERNAME.test(username)) {
    return NextResponse.json(
      { error: "Usernames are 2–32 characters: letters, numbers, dot, dash, underscore." },
      { status: 400 },
    );
  }
  if (password.length < MIN_PASSWORD) {
    return NextResponse.json(
      { error: `Use at least ${MIN_PASSWORD} characters.` },
      { status: 400 },
    );
  }

  try {
    const user = await prisma.user.create({
      data: {
        username,
        name: name || null,
        passwordHash: await hashPassword(password),
        isAdmin: true,
      },
      select: { id: true },
    });
    forgetUserCount();
    // Everything recorded before this moment belonged to whoever had the shared password. It
    // belongs to this account now, or it would belong to nobody and be visible to nobody.
    await adoptOrphanedMeetings(user.id);
    // The recovery code is shown once, on the screen that follows, and never stored — only its
    // wrapping of the key is.
    const { recoveryCode } = await setUpKey(user.id, password);
    const { value, expiresAt } = await startSession(user.id, req.headers.get("user-agent"));
    const res = NextResponse.json({ ok: true, recoveryCode });
    res.cookies.set(SESSION_COOKIE, value, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_TTL_MS / 1000,
      expires: expiresAt,
    });
    return res;
  } catch {
    // Two people at the setup screen at once: one of them wins, and the other is now looking at
    // a server that has an account.
    forgetUserCount();
    return NextResponse.json({ error: "That username is taken." }, { status: 409 });
  }
}
