import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";

// Getting back in without anybody learning your password.
//
// An administrator cannot set somebody's password here. They issue one of these and hand it
// over — in person, or however they already talk to each other. The difference is small and
// real: an administrator who could set a password could read the minutes of anybody who never
// noticed, and nothing on the account would show it had happened.
//
// Fifteen minutes, because that is how long it takes to walk across a room. A link that lives
// for a day is a password sitting in a chat history.

export const RESET_TTL_MS = 15 * 60 * 1000;

function hash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Issue one, and return the token exactly once.
 *
 * The caller shows it and forgets it: only the hash is stored, so nothing — not this process,
 * not a database dump, not a later administrator — can produce the link again. Losing it means
 * issuing another, which costs nothing.
 */
export async function issueReset(userId: string, issuedById: string): Promise<string> {
  // Any outstanding link for this person stops working. Two live links is one more than anybody
  // needs and one more chance for the older one to be found later.
  await prisma.passwordReset.deleteMany({ where: { userId, usedAt: null } });

  const token = randomBytes(32).toString("base64url");
  await prisma.passwordReset.create({
    data: {
      tokenHash: hash(token),
      userId,
      issuedById,
      expiresAt: new Date(Date.now() + RESET_TTL_MS),
    },
  });
  return token;
}

export type ResetCheck = { ok: true; userId: string; id: string } | { ok: false; why: string };

/** Is this link still good? Read-only, so the reset page can say so before asking for a password. */
export async function checkReset(token: string): Promise<ResetCheck> {
  const row = await prisma.passwordReset.findUnique({
    where: { tokenHash: hash(token) },
    select: { id: true, userId: true, expiresAt: true, usedAt: true },
  });
  // One message for every way of being wrong. Distinguishing "expired" from "never existed"
  // tells somebody holding a guessed token that they guessed a real one.
  if (!row || row.usedAt || row.expiresAt <= new Date()) {
    return { ok: false, why: "That link has expired or has already been used." };
  }
  return { ok: true, userId: row.userId, id: row.id };
}

/**
 * Spend it.
 *
 * The update is conditional on the row still being unused, so two browsers posting the same
 * token at once cannot both succeed — the second changes no rows and is refused.
 */
export async function consumeReset(token: string): Promise<{ userId: string } | null> {
  const check = await checkReset(token);
  if (!check.ok) return null;
  const { count } = await prisma.passwordReset.updateMany({
    where: { id: check.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  return count === 1 ? { userId: check.userId } : null;
}
