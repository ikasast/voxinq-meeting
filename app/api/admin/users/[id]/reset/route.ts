import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { RESET_TTL_MS, issueReset } from "@/lib/auth/reset";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

// Issue a link for somebody who cannot get in.
//
// The administrator never learns the password and never sets it. They get a URL, once, and hand
// it over. Fifteen minutes, because that is how long it takes to walk across a room — a link
// that lives for a day is a password sitting in a chat history.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.res;
  const { id } = await ctx.params;

  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, username: true, disabledAt: true },
  });
  if (!target) return NextResponse.json({ error: "no such account" }, { status: 404 });
  if (target.disabledAt) {
    return NextResponse.json(
      { error: "That account is disabled. Enable it first." },
      { status: 400 },
    );
  }

  const token = await issueReset(target.id, guard.me.id);
  // Built from the request so the link works over whatever address this server is reached at —
  // a tailnet name, a LAN address — rather than one written into a setting that is wrong the
  // first time somebody visits by another route.
  const origin = new URL(req.url).origin;
  return NextResponse.json({
    ok: true,
    username: target.username,
    url: `${origin}/reset/${token}`,
    expiresInMinutes: Math.round(RESET_TTL_MS / 60000),
  });
}
