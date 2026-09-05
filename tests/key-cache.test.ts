import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// How long a key stays open, which is the whole of what this design costs.
//
// A key is open at all because work outlives the browser that asked for it, so it cannot protect
// against somebody who controls the running server. The answer is to keep it open for as short a
// time as the queue allows.

// The in-memory half is now only a read-through cache in front of a row, so the parts worth
// testing without a database are the wiring and the lifetime rule. The row itself is exercised
// against a real PostgreSQL in tests/key-unlock.test.ts.

describe("what the queue does with them", () => {
  const dispatcher = readFileSync(
    join(__dirname, "..", "lib/queue/dispatcher.ts"),
    "utf8",
  );

  it("releases idle keys on every tick", () => {
    expect(dispatcher).toContain("await releaseIdleKeys();");
  });

  it("decides who is busy from the queue, not from who is signed in", () => {
    // A session lasts thirty days. Tying the key to it would mean holding one for a month after
    // the last thing that needed it finished — which is most of the way back to not encrypting.
    expect(dispatcher).toContain('status: { in: ["queued", "running"] }');
    expect(dispatcher).toContain("j.meeting?.ownerId");
  });
});

describe("where an open key lives", () => {
  const cache = readFileSync(join(__dirname, "..", "lib/crypto/key-cache.ts"), "utf8");
  const unlock = readFileSync(join(__dirname, "..", "lib/crypto/unlock.ts"), "utf8");

  it("is a row, because memory cannot cross the app", () => {
    // Next.js loads a module into several registries in one process, each with its own globals.
    // Measured by stamping each load: four ids under one pid. The login route's map is not the
    // dispatcher's map, so a key opened by signing in was invisible to the work that needed it.
    expect(cache).toContain("storeUnlock");
    expect(cache).toContain("loadUnlock");
    expect(unlock).toContain("prismaRaw.keyUnlock.upsert");
  });

  it("is never stored as the key itself", () => {
    expect(unlock).toContain("wrapKey(master, serverSecret())");
    expect(unlock).not.toMatch(/wrapped:\s*master/);
  });

  it("warns when the server secret was left at its default", () => {
    // Without one, a stolen database alone reads whatever is unlocked.
    expect(unlock).toContain("VOXINQ_KEY_SECRET is not set");
  });

  it("has a short read-through cache, not a long-lived copy", () => {
    // One context cannot be told that another has forgotten a key, so the row is the truth and
    // this is only how often it is re-read.
    expect(cache).toContain("CACHE_MS = 30_000");
  });
});
