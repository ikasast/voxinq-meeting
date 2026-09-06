import { createHash } from "node:crypto";
import { prismaRaw } from "@/lib/prisma-raw";
import { unwrapKey, wrapKey } from "./keys";

// Carrying an open key from the request that opened it to the queue that needs it.
//
// It cannot be carried in memory. Next.js loads a module into several separate registries inside
// one process — measured by stamping each load: four different ids under one pid — and each has
// its own `globalThis`. The map the login route writes to is not the map the dispatcher reads,
// so a key opened by signing in was invisible to the work that needed it and every job sat
// waiting for somebody who was already there.
//
// So it goes in a row, encrypted under a secret from the environment.
//
// **What that costs, stated plainly.** Somebody holding both the database and the `.env` can
// read whatever is unlocked at that moment. That is the same exposure as holding the key in this
// process's memory, which the design already accepted; what it adds is a brief appearance on
// disk. What it still buys: a stolen database, a dump or a backup is not a set of open keys, and
// nothing is readable for accounts with no work in the queue.
//
// **The window is the session.** The row is written when a key is opened and deleted once its
// owner has no work left, is not signed in anywhere, and has not used it for a while.
//
// It was idleness alone, and that was wrong in a way only running it showed. Inside a tailnet
// nobody types a password — the identity header *is* the sign-in — so nothing ever opened the
// key, and fifteen minutes after the last time anything did, an entire archive read as
// `🔒 encrypted` with nothing on screen to say why. The lifetime has to be something the person
// can see and control, and "signed in" is that; signing out is what locks it again, and now
// means it.

/** How long a key stays open with nobody signed in, nothing queued, and nothing using it. */
const IDLE_MS = 15 * 60 * 1000;

/** How often "still in use" is written down. Reads are frequent; this is not. */
const TOUCH_EVERY_MS = 60 * 1000;

const WARNED = { done: false };

/**
 * The secret the rows are wrapped with.
 *
 * Its own variable rather than reusing the cookie secret: they protect different things, and
 * somebody rotating one to sign everybody out should not, by doing so, make every open key
 * unreadable mid-job.
 */
function serverSecret(): Buffer {
  const raw = process.env.VOXINQ_KEY_SECRET ?? process.env.APP_SESSION_SECRET;
  if (!raw && !WARNED.done) {
    WARNED.done = true;
    console.warn(
      "[voxinq] VOXINQ_KEY_SECRET is not set — open keys are wrapped with a built-in default, " +
        "so a stolen database is enough to read whatever is unlocked. Set a long random value " +
        "in .env.",
    );
  }
  return createHash("sha256")
    .update(raw ?? "voxinq-default-key-secret")
    .digest();
}

/** Remember an open key where every part of the app can find it. */
export async function storeUnlock(userId: string, master: Buffer): Promise<void> {
  const wrapped = wrapKey(master, serverSecret());
  await prismaRaw.keyUnlock.upsert({
    where: { userId },
    create: { userId, wrapped },
    update: { wrapped, createdAt: new Date() },
  });
}

/** The open key for this account, or null when there is not one. */
export async function loadUnlock(userId: string): Promise<Buffer | null> {
  const row = await prismaRaw.keyUnlock.findUnique({
    where: { userId },
    select: { wrapped: true, lastUsedAt: true },
  });
  if (!row) return null;
  // Touched, but not on every read: this is called for every query that might hold ciphertext,
  // and a write per read would turn browsing into a write storm for no benefit.
  if (Date.now() - row.lastUsedAt.getTime() > TOUCH_EVERY_MS) {
    await prismaRaw.keyUnlock
      .update({ where: { userId }, data: { lastUsedAt: new Date() } })
      .catch(() => {});
  }
  // A row that will not unwrap is one written under a different server secret. Treating it as
  // absent is right: it is not usable, and leaving it would keep the account permanently
  // "unlocked" without anything being readable.
  return unwrapKey(row.wrapped, serverSecret());
}

export async function clearUnlock(userId: string): Promise<void> {
  await prismaRaw.keyUnlock.deleteMany({ where: { userId } });
}

/**
 * Forget every open key whose owner has nothing left to run.
 *
 * This is the whole of the lifetime guarantee, so it runs on every dispatcher tick rather than
 * on a timer that could be missed.
 */
export async function clearIdleUnlocks(busy: Set<string>): Promise<number> {
  // Anybody with a session that has not expired. Their key stays open because they are, by the
  // only definition the server has, still here — and because the alternative is what shipped:
  // a tailnet user, who never types a password, watching their own meetings turn into padlocks
  // fifteen minutes after anything last touched the key.
  const signedIn = await prismaRaw.session.findMany({
    where: { expiresAt: { gt: new Date() } },
    select: { userId: true },
    distinct: ["userId"],
  });
  const spare = new Set([...busy, ...signedIn.map((s) => s.userId)]);

  const { count } = await prismaRaw.keyUnlock.deleteMany({
    where: {
      // Three conditions, and each covers a case the others miss: the queue, because a job
      // outlives the browser that asked for it; the session, because a person reading their own
      // meetings needs the key as much as a job does; and idleness, for the key left open by a
      // session that has since expired.
      lastUsedAt: { lt: new Date(Date.now() - IDLE_MS) },
      ...(spare.size > 0 ? { userId: { notIn: [...spare] } } : {}),
    },
  });
  return count;
}
