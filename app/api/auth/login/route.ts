import { NextResponse } from "next/server";
import { AUTH_COOKIE, expectedAuthToken } from "@/lib/auth-token";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const pw = process.env.APP_PASSWORD;
  if (!pw) {
    return NextResponse.json({ error: "Auth is disabled (APP_PASSWORD not set)" }, { status: 400 });
  }
  const body = (await req.json().catch(() => null)) as { password?: unknown } | null;
  if (!body || typeof body.password !== "string" || body.password !== pw) {
    return NextResponse.json({ error: "Wrong password" }, { status: 401 });
  }
  const token = await expectedAuthToken();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, token!, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
  return res;
}
