import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { dropIdleKeys, dropKey, hasKey, heldKey, holdKey } from "../lib/crypto/key-cache";

// How long a key is in memory, which is the whole of what this design costs.
//
// A key is here only because work outlives the browser that asked for it. It cannot protect
// against somebody who controls the running process — while a key is held, that person can read
// that account's data — so the answer is to hold it for as short a time as the queue allows.

const KEY_A = Buffer.alloc(32, 1);
const KEY_B = Buffer.alloc(32, 2);

beforeEach(() => {
  dropKey("a");
  dropKey("b");
});

describe("holding a key", () => {
  it("gives it back to the account it belongs to, and nobody else", () => {
    holdKey("a", Buffer.from(KEY_A));
    expect(heldKey("a")?.equals(KEY_A)).toBe(true);
    expect(heldKey("b")).toBeNull();
  });

  it("zeroes the bytes it was holding when it forgets", () => {
    // Not a guarantee — the collector may have copied it already — but it removes the copy this
    // map was keeping, which is the one thing that can actually be removed.
    const mine = Buffer.from(KEY_A);
    holdKey("a", mine);
    dropKey("a");
    expect(mine.every((b) => b === 0)).toBe(true);
    expect(hasKey("a")).toBe(false);
  });
});

describe("dropping the keys of people with nothing running", () => {
  it("keeps the busy and forgets the rest", () => {
    holdKey("a", Buffer.from(KEY_A));
    holdKey("b", Buffer.from(KEY_B));
    expect(dropIdleKeys(new Set(["a"]))).toBe(1);
    expect(hasKey("a")).toBe(true);
    expect(hasKey("b")).toBe(false);
  });

  it("empties completely when nobody has work", () => {
    // The property worth having: at three in the morning this process holds nothing.
    holdKey("a", Buffer.from(KEY_A));
    holdKey("b", Buffer.from(KEY_B));
    expect(dropIdleKeys(new Set())).toBe(2);
    expect(hasKey("a")).toBe(false);
    expect(hasKey("b")).toBe(false);
  });

  it("does nothing when there is nothing to drop", () => {
    expect(dropIdleKeys(new Set(["a", "b"]))).toBe(0);
  });
});

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
