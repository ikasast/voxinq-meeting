import { clearIdleUnlocks, clearUnlock, loadUnlock, storeUnlock } from "./unlock";

// The open keys this part of the app is using, and for how long.
//
// A key is available at all because of the queue: minutes are written after the meeting, often
// after the browser has gone, and the work needs the plaintext. Decrypting only inside a request
// would mean minutes, diarization and re-transcription stopped running in the background, which
// is the thing v3.0 was built to make possible.
//
// The honest statement, which belongs in the documentation and not only here:
//
//   **This does not protect you from somebody who controls the running server.** While a key is
//   open, a person with the database and the environment can read that account's data. What is
//   protected is a stolen disk, a database dump, a backup file, and an administrator reading
//   rows — which is what "encrypted at rest" means and all it has ever meant.
//
// So the lifetime is made as short as the queue allows: a key is opened when its owner signs in
// and forgotten as soon as they have nothing left to run.
//
// The memory below is only a read-through cache, and it has to be short-lived: *this module
// exists several times over in one process* — Next.js gives route handlers, server components
// and the dispatcher separate registries, each with its own globals — so one context cannot be
// told that another has forgotten a key. The row is the truth; this decides how often it is
// re-read.

type Cached = { key: Buffer; readAt: number };

/** Long enough to serve a page without re-reading per query, short enough not to outlive much. */
const CACHE_MS = 30_000;

const store = globalThis as typeof globalThis & { __voxinqKeys?: Map<string, Cached> };
const cache: Map<string, Cached> = (store.__voxinqKeys ??= new Map());

/** Open a key: remembered here, and written where the rest of the app can find it. */
export async function holdKey(userId: string, key: Buffer): Promise<void> {
  await storeUnlock(userId, key);
  cache.set(userId, { key, readAt: Date.now() });
}

/** The open key for this account, or null. Reads through to the row when the cache is stale. */
export async function keyFor(userId: string): Promise<Buffer | null> {
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.readAt < CACHE_MS) return hit.key;
  const key = await loadUnlock(userId);
  if (key) cache.set(userId, { key, readAt: Date.now() });
  else cache.delete(userId);
  return key;
}

export async function hasKey(userId: string): Promise<boolean> {
  return (await keyFor(userId)) !== null;
}

/** Forget one, here and everywhere. */
export async function dropKey(userId: string): Promise<void> {
  const entry = cache.get(userId);
  // Zeroing is not a guarantee — the collector may have copied it — but it removes the copy this
  // map was holding, which is the one copy that can be removed.
  if (entry) entry.key.fill(0);
  cache.delete(userId);
  await clearUnlock(userId);
}

/**
 * Forget the keys of everybody with nothing left to run.
 *
 * Called by the dispatcher after each tick. `busy` is who still has work; everybody else loses
 * theirs the moment their queue empties. On an instance where nobody is working at three in the
 * morning, there are no open keys at all.
 */
export async function dropIdleKeys(busy: Set<string>): Promise<number> {
  for (const [userId, entry] of [...cache.entries()]) {
    if (!busy.has(userId)) {
      entry.key.fill(0);
      cache.delete(userId);
    }
  }
  return clearIdleUnlocks(busy);
}
