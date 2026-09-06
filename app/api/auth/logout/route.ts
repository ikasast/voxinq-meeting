import { NextResponse } from "next/server";
import { AUTH_COOKIE } from "@/lib/auth-token";
import { SESSION_COOKIE } from "@/lib/auth/cookie";
import { currentUser, endSession } from "@/lib/auth/session";
import { dropKey } from "@/lib/crypto/key-cache";

export const runtime = "nodejs";

// Signing out deletes the session row, not just the cookie: on a shared or borrowed machine,
// "log me out" has to mean the copy of the cookie somebody kept stops working too.
export async function POST(req: Request) {
  const cookie = req.headers
    .get("cookie")
    ?.split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);
  // The key's lifetime is the session's now, so signing out has to close it — and here rather
  // than on the dispatcher's next tick, because "log me out" on a borrowed machine should not
  // leave the data readable for however long that is.
  const me = await currentUser();
  await endSession(cookie);
  if (me) await dropKey(me.id);
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  res.cookies.delete(AUTH_COOKIE);
  return res;
}
