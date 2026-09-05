import { NextResponse } from "next/server";
import { AUTH_COOKIE } from "@/lib/auth-token";
import { SESSION_COOKIE } from "@/lib/auth/cookie";
import { endSession } from "@/lib/auth/session";

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
  await endSession(cookie);
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  res.cookies.delete(AUTH_COOKIE);
  return res;
}
