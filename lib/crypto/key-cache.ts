// The unwrapped keys this process is holding, and for how long.
//
// A key has to be here at all because of the queue: minutes are written after the meeting, often
// after the browser has gone, and the work needs the plaintext. The alternative — decrypting
// only inside a request — would mean minutes, diarization and re-transcription stopped running
// in the background at all, which is the thing v3.0 was built to make possible.
//
// So the honest statement, which belongs in the documentation and not only here:
//
//   **This does not protect you from somebody who controls the running server.** While a key is
//   held, a person with access to this process's memory can read that account's data. What it
//   protects is the disk, a database dump, a backup file, and an administrator reading rows —
//   which is what "encrypted at rest" means and all it has ever meant.
//
// The lifetime is therefore made as short as the queue allows: a key is taken when its owner
// signs in, and dropped as soon as that owner has nothing left in the queue. On an instance
// where nobody is working at three in the morning, this map is empty.

type Held = { key: Buffer; takenAt: number };

const held = new Map<string, Held>();

/** Remember a key for somebody who has just proved they own it. */
export function holdKey(userId: string, key: Buffer): void {
  held.set(userId, { key, takenAt: Date.now() });
}

export function heldKey(userId: string): Buffer | null {
  return held.get(userId)?.key ?? null;
}

export function hasKey(userId: string): boolean {
  return held.has(userId);
}

/**
 * Forget one, zeroing the bytes first.
 *
 * Zeroing is not a guarantee — the garbage collector may already have copied the buffer — but
 * it costs nothing and removes the copy this map was holding.
 */
export function dropKey(userId: string): void {
  const entry = held.get(userId);
  if (entry) entry.key.fill(0);
  held.delete(userId);
}

/**
 * Drop the keys of everybody with nothing left to run.
 *
 * Called by the dispatcher after each tick. `busy` is who still has work: they keep their key,
 * and everybody else loses theirs the moment their queue empties.
 */
export function dropIdleKeys(busy: Set<string>): number {
  let dropped = 0;
  for (const userId of [...held.keys()]) {
    if (!busy.has(userId)) {
      dropKey(userId);
      dropped++;
    }
  }
  return dropped;
}

/** For the account screen, which should be able to say whether the server is holding one. */
export function heldSince(userId: string): number | null {
  return held.get(userId)?.takenAt ?? null;
}

/** Signing out everywhere, an account being disabled, a password changing. */
export function forget(userId: string): void {
  dropKey(userId);
}
