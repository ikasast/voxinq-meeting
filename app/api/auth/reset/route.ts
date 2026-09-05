import { NextResponse } from "next/server";
import { SESSION_COOKIE, SESSION_TTL_MS } from "@/lib/auth/cookie";
import { hashPassword } from "@/lib/auth/password";
import { consumeReset } from "@/lib/auth/reset";
import { startSession } from "@/lib/auth/session";
import { resetKey, rewrapForNewPassword, unlockWithRecoveryCode } from "@/lib/crypto/user-keys";
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
    recoveryCode?: unknown;
    startOver?: unknown;
  } | null;
  const token = typeof body?.token === "string" ? body.token : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const recoveryCode = typeof body?.recoveryCode === "string" ? body.recoveryCode : "";
  // Said out loud by whoever is doing it, not inferred from an empty field. Starting again means
  // everything already encrypted stays on disk and stays unreadable, and somebody who has simply
  // mislaid the code for a minute should hit a refusal rather than a fresh key.
  const startOver = body?.startOver === true;
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

  // The key first, because what happens to it decides what this reset even means.
  const hasKey = await prisma.user.findUnique({
    where: { id: spent.userId },
    select: { keySalt: true },
  });
  let recovered: string | null = null;
  if (hasKey?.keySalt) {
    if (recoveryCode) {
      const master = await unlockWithRecoveryCode(spent.userId, recoveryCode);
      if (!master) {
        return NextResponse.json(
          { error: "That recovery code does not match this account." },
          { status: 400 },
        );
      }
      await rewrapForNewPassword(spent.userId, master, password);
    } else if (startOver) {
      // Everything encrypted under the old key stays where it is and stays unreadable. The
      // caller has already had to say so.
      ({ recoveryCode: recovered } = await resetKey(spent.userId, password));
    } else {
      return NextResponse.json(
        {
          error:
            "This account has encrypted meetings. Enter your recovery code to keep them, or" +
            " confirm that you are starting again without them.",
          needsRecoveryCode: true,
        },
        { status: 409 },
      );
    }
  }

  await prisma.user.update({
    where: { id: spent.userId },
    data: { passwordHash: await hashPassword(password) },
  });
  // Every other session ends. If the reason for the reset was that somebody else had the
  // account, leaving their browser signed in would make the whole exercise pointless.
  await prisma.session.deleteMany({ where: { userId: spent.userId } });

  const { value, expiresAt } = await startSession(spent.userId, req.headers.get("user-agent"));
  // A new key means a new recovery code, and it is shown once, here.
  const res = NextResponse.json({ ok: true, recoveryCode: recovered });
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
