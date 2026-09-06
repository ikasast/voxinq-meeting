import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/admin";
import { looksLikeEmail, normaliseEmail } from "@/lib/auth/email";
import { hashPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

// The people on this server.
//
// What is listed is who they are and how they get in — never anything they own. An
// administrator runs the machine; that is not the same as being able to read everybody's
// minutes, and this screen is where the difference would be easiest to lose.

const USERNAME = /^[a-z0-9._-]{2,32}$/;
const MIN_PASSWORD = 8;

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.res;

  const users = await prisma.user.findMany({
    orderBy: [{ isAdmin: "desc" }, { username: "asc" }],
    select: {
      id: true,
      username: true,
      email: true,
      name: true,
      isAdmin: true,
      disabledAt: true,
      tailscaleLogin: true,
      createdAt: true,
      lastSeenAt: true,
      imageType: true,
      passwordHash: true,
      // How much of the machine each person is using, which is a number an administrator needs
      // and says nothing about what any of it is.
      _count: { select: { meetings: true, sessions: true } },
    },
  });

  return NextResponse.json({
    users: users.map((u) => ({
      id: u.id,
      username: u.username,
      email: u.email,
      name: u.name,
      isAdmin: u.isAdmin,
      disabled: u.disabledAt !== null,
      tailscaleLogin: u.tailscaleLogin,
      createdAt: u.createdAt,
      lastSeenAt: u.lastSeenAt,
      hasImage: u.imageType !== null,
      // Whether they can sign in from outside the tailnet, not the hash itself.
      hasPassword: u.passwordHash !== null,
      meetings: u._count.meetings,
      sessions: u._count.sessions,
    })),
  });
}

export async function POST(req: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.res;

  const body = (await req.json().catch(() => null)) as {
    username?: unknown;
    email?: unknown;
    name?: unknown;
    password?: unknown;
    isAdmin?: unknown;
    tailscaleLogin?: unknown;
  } | null;

  const username = typeof body?.username === "string" ? body.username.trim().toLowerCase() : "";
  const email = typeof body?.email === "string" ? normaliseEmail(body.email) : "";
  if (!USERNAME.test(username)) {
    return apiError(
      "Usernames are 2–32 characters: letters, numbers, dot, dash, underscore.",
      400,
    );
  }
  if (!looksLikeEmail(email)) {
    return apiError("An email address is how they will sign in. Enter theirs.", 400);
  }
  const password = typeof body?.password === "string" ? body.password : "";
  if (password && password.length < MIN_PASSWORD) {
    return apiError("Use at least {n} characters.", 400, { vars: { n: MIN_PASSWORD } });
  }
  const tailscaleLogin =
    typeof body?.tailscaleLogin === "string" && body.tailscaleLogin.trim()
      ? body.tailscaleLogin.trim()
      : null;

  try {
    const user = await prisma.user.create({
      data: {
        username,
        email,
        name: typeof body?.name === "string" && body.name.trim() ? body.name.trim() : null,
        // An account with no password is not locked out: it is one that arrives through the
        // tailnet, or one waiting for a reset link. Both are ordinary here.
        passwordHash: password ? await hashPassword(password) : null,
        isAdmin: body?.isAdmin === true,
        tailscaleLogin,
      },
      select: { id: true, username: true },
    });
    return NextResponse.json({ ok: true, user });
  } catch {
    return apiError("That username, email, or tailnet login is already taken.", 409);
  }
}
