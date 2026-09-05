import { cookies, headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { SESSION_COOKIE, SESSION_TTL_MS, packSession, unpackSession } from "./cookie";

// Who is asking.
//
// Two ways in, and they answer the same question:
//
//   a session cookie          somebody signed in with a username and password
//   Tailscale-User-Login      somebody the tailnet has already authenticated
//
// The second is why this app has never asked most people for a password: inside the tailnet
// the identity is already established, and re-asking would be theatre. It becomes an account
// the first time it is seen, so that owning things and being someone are the same mechanism
// whichever door was used.

export type CurrentUser = {
  id: string;
  username: string;
  name: string | null;
  isAdmin: boolean;
  /** How this request was identified — shown in Settings, and worth not guessing about. */
  via: "session" | "tailnet";
};

/** Has anybody signed up yet? Until then the app behaves exactly as it did before v3.1. */
export async function hasUsers(): Promise<boolean> {
  return (await prisma.user.count()) > 0;
}

/**
 * Resolve the request to a person, or null.
 *
 * The session row is read here rather than in the proxy: the cookie's signature proves this
 * server issued it, and only the row proves it has not since been signed out or deleted.
 */
export async function currentUser(): Promise<CurrentUser | null> {
  const jar = await cookies();
  const sessionId = await unpackSession(jar.get(SESSION_COOKIE)?.value);
  if (sessionId) {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      select: {
        expiresAt: true,
        user: { select: { id: true, username: true, name: true, isAdmin: true, disabledAt: true } },
      },
    });
    if (session && session.expiresAt > new Date() && !session.user.disabledAt) {
      return { ...strip(session.user), via: "session" };
    }
  }

  const login = (await headers()).get("tailscale-user-login");
  if (login) {
    const user = await resolveTailnetUser(login);
    if (user && !user.disabledAt) return { ...strip(user), via: "tailnet" };
  }

  return null;
}

/**
 * The person behind a tailnet identity, creating the account the first time one is seen.
 *
 * Provisioning rather than refusing, because of what this replaces: before accounts existed,
 * a tailnet request had *full access with no account at all*. Turning that into a login prompt
 * would break every phone in the house on upgrade, to protect against someone who is already
 * inside the tailnet — which is the trust boundary this app was built on.
 *
 * **The first account is an admin, however it was made.** Otherwise browsing from a phone
 * before visiting /setup would create a non-admin, and /setup would then refuse because
 * accounts exist: an install with no administrator and no way to make one.
 */
async function resolveTailnetUser(login: string) {
  const found = await prisma.user.findUnique({
    where: { tailscaleLogin: login },
    select: { id: true, username: true, name: true, isAdmin: true, disabledAt: true },
  });
  if (found) return found;

  try {
    return await prisma.user.create({
      data: {
        username: await freeUsername(login.split("@")[0] || "user"),
        name: login,
        tailscaleLogin: login,
        isAdmin: (await prisma.user.count()) === 0,
      },
      select: { id: true, username: true, name: true, isAdmin: true, disabledAt: true },
    });
  } catch {
    // Two tabs arriving at once race here, and the loser's unique-constraint failure is not an
    // error — the account it wanted now exists.
    return prisma.user.findUnique({
      where: { tailscaleLogin: login },
      select: { id: true, username: true, name: true, isAdmin: true, disabledAt: true },
    });
  }
}

/** `sam`, then `sam2`, `sam3`… Usernames are unique and an identity is not negotiable. */
async function freeUsername(base: string): Promise<string> {
  const clean = base.toLowerCase().replace(/[^a-z0-9._-]/g, "") || "user";
  for (let i = 1; i < 50; i++) {
    const candidate = i === 1 ? clean : `${clean}${i}`;
    if (!(await prisma.user.findUnique({ where: { username: candidate }, select: { id: true } }))) {
      return candidate;
    }
  }
  return `${clean}-${Date.now()}`;
}

function strip(u: {
  id: string;
  username: string;
  name: string | null;
  isAdmin: boolean;
  disabledAt: Date | null;
}) {
  return { id: u.id, username: u.username, name: u.name, isAdmin: u.isAdmin };
}

/**
 * Is this session still real? Used by the proxy, which has the cookie but not the request.
 *
 * The signature alone is not enough and cannot be made enough: it says this server issued the
 * cookie, and nothing about whether the session still exists. Without this read, "sign out
 * every device" reports success and changes nothing until the cookie expires a month later —
 * which is the one promise a session list must not break.
 */
export async function sessionIsLive(sessionId: string): Promise<boolean> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { expiresAt: true, user: { select: { disabledAt: true } } },
  });
  return Boolean(session && session.expiresAt > new Date() && !session.user.disabledAt);
}

/** Start a session for this browser. Returns what to put in the cookie. */
export async function startSession(userId: string, userAgent?: string | null) {
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const session = await prisma.session.create({
    data: { userId, expiresAt, userAgent: userAgent?.slice(0, 300) ?? null },
    select: { id: true },
  });
  await prisma.user.update({ where: { id: userId }, data: { lastSeenAt: new Date() } });
  return { value: await packSession(session.id, expiresAt), expiresAt };
}

/** End one. Deleting the row is what makes signing out mean something on a shared machine. */
export async function endSession(cookieValue: string | undefined | null): Promise<void> {
  const sessionId = await unpackSession(cookieValue);
  if (sessionId) await prisma.session.deleteMany({ where: { id: sessionId } });
}

/** Expired rows are rubbish, not history. Swept on login, which is often enough. */
export async function pruneSessions(): Promise<number> {
  const { count } = await prisma.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  return count;
}
