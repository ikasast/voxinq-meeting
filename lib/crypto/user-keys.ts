import { prisma } from "@/lib/prisma";
import { holdKey, dropKey } from "./key-cache";
import {
  newMasterKey,
  newRecoveryCode,
  newSalt,
  normaliseRecoveryCode,
  unwrapKey,
  wrapKey,
  wrappingKey,
} from "./keys";

// Setting an account's key up, and opening it again afterwards.
//
// **A key needs a password.** An account that only ever arrives through the tailnet has none —
// inside the tailnet nobody is asked for one — and there is nothing to derive a wrapping key
// from. Such an account is not encrypted, and the way to change that is to set a password,
// which the account screen already offers for a different reason.

export type KeySetup = { recoveryCode: string };

/**
 * Give an account a key, and hand back the recovery code once.
 *
 * The code is returned and never stored: only its wrapping of the master key is. Losing it and
 * the password together means the data is gone, which is the property being bought and not an
 * accident to be repaired later.
 */
export async function setUpKey(userId: string, password: string): Promise<KeySetup> {
  const master = newMasterKey();
  const salt = newSalt();
  const recoveryCode = newRecoveryCode();

  const [byPassword, byRecovery] = await Promise.all([
    wrappingKey(password, salt),
    wrappingKey(normaliseRecoveryCode(recoveryCode), salt),
  ]);

  await prisma.user.update({
    where: { id: userId },
    data: {
      keySalt: salt,
      keyWrappedPassword: wrapKey(master, byPassword),
      keyWrappedRecovery: wrapKey(master, byRecovery),
      keyCreatedAt: new Date(),
    },
  });

  // Held straight away: whoever just set this up is signed in and about to use it.
  holdKey(userId, master);
  return { recoveryCode };
}

/** Open an account's key with its password. Null when the password is wrong or there is no key. */
export async function unlockWithPassword(userId: string, password: string): Promise<Buffer | null> {
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: { keySalt: true, keyWrappedPassword: true },
  });
  if (!row?.keySalt) return null;
  const master = unwrapKey(row.keyWrappedPassword, await wrappingKey(password, row.keySalt));
  if (master) holdKey(userId, master);
  return master;
}

/** The same, with the recovery code. Used when the password is being reset. */
export async function unlockWithRecoveryCode(
  userId: string,
  code: string,
): Promise<Buffer | null> {
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: { keySalt: true, keyWrappedRecovery: true },
  });
  if (!row?.keySalt) return null;
  const master = unwrapKey(
    row.keyWrappedRecovery,
    await wrappingKey(normaliseRecoveryCode(code), row.keySalt),
  );
  if (master) holdKey(userId, master);
  return master;
}

/**
 * Re-wrap the master key under a new password, keeping the same key.
 *
 * The key itself never changes, so nothing already encrypted has to be rewritten — which is
 * what makes changing a password cheap rather than a migration of everything the account owns.
 * The recovery code's wrapping is left alone for the same reason: it still holds the same key.
 */
export async function rewrapForNewPassword(
  userId: string,
  master: Buffer,
  password: string,
): Promise<void> {
  const row = await prisma.user.findUnique({ where: { id: userId }, select: { keySalt: true } });
  if (!row?.keySalt) return;
  await prisma.user.update({
    where: { id: userId },
    data: { keyWrappedPassword: wrapKey(master, await wrappingKey(password, row.keySalt)) },
  });
}

/**
 * Start again with a new key, abandoning what the old one protected.
 *
 * What happens when somebody resets their password and has no recovery code. Everything already
 * encrypted stays on disk and stays unreadable; a new key means new work is readable again. The
 * caller has to have told them, in those words, before getting here.
 */
export async function resetKey(userId: string, password: string): Promise<KeySetup> {
  dropKey(userId);
  return setUpKey(userId, password);
}

export async function hasKey(userId: string): Promise<boolean> {
  const row = await prisma.user.findUnique({ where: { id: userId }, select: { keySalt: true } });
  return Boolean(row?.keySalt);
}
