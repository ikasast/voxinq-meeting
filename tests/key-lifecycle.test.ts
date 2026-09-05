import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

// Where a key is made, opened, moved and abandoned. Each of these is a moment where getting it
// wrong is silent — an account that signs in fine and cannot read anything, or a key that is
// quietly recoverable by somebody it should not be.

describe("a key is made where a password first exists", () => {
  it("at the first account", () => {
    expect(read("app/api/auth/setup/route.ts")).toContain("setUpKey(user.id, password)");
  });

  it("and when somebody sets their first password", () => {
    // An account that only ever arrives through the tailnet has no secret to derive a wrapping
    // key from, so it has no key until it has a password.
    expect(read("app/api/auth/password/route.ts")).toContain("if (!hadKey) {");
    expect(read("app/api/auth/password/route.ts")).toContain("setUpKey(me.id, password)");
  });

  it("and when a reset link is what gives them one", () => {
    // The ordinary way somebody joins: an administrator adds them — the form does not offer to
    // set a password — and hands over a link. Without this branch the link set a password and
    // stopped there, so every account but the very first ended up with no key at all and its
    // meetings stored in the clear, while the app said they were encrypted.
    const route = read("app/api/auth/reset/route.ts");
    expect(route).toContain("setUpKey(spent.userId, password)");
    // In the `else` of "does this account already have a key", not somewhere that would also
    // fire for an account whose key must be kept.
    expect(route.indexOf("} else {")).toBeGreaterThan(route.indexOf("if (hasKey?.keySalt) {"));
  });
});

describe("a new key schedules the walk over what is already there", () => {
  it("from the one place a key is made", () => {
    // Not at the three call sites — it was forgotten at all three. The effect was not only that
    // old meetings stayed in the clear: a reader with a key searches the index and nothing else,
    // so everything recorded before the key vanished from search, titles included, until that
    // person happened to sign out and back in.
    const keys = read("lib/crypto/user-keys.ts");
    expect(keys).toContain("enqueueEncryptionIfNeeded(userId)");
    expect(keys.indexOf("enqueueEncryptionIfNeeded(userId)")).toBeGreaterThan(
      keys.indexOf("holdKey(userId, master)"),
    );
  });

  it("and signing in still catches whatever was left", () => {
    // The self-correcting half: a pass interrupted by a restart finds the rest next time.
    expect(read("app/api/auth/login/route.ts")).toContain("enqueueEncryptionIfNeeded(user.id)");
  });
});

describe("the recovery code", () => {
  const keys = read("lib/crypto/user-keys.ts");

  it("is returned, never stored", () => {
    // Only its wrapping of the key is. Verified against the database too: the code does not
    // appear anywhere in the row.
    expect(keys).toContain("keyWrappedRecovery: wrapKey(master, byRecovery)");
    expect(keys).not.toMatch(/recoveryCode:\s*recoveryCode,/);
  });

  it("opens the same key the password opens", () => {
    expect(keys).toContain("wrapKey(master, byPassword)");
    expect(keys).toContain("wrapKey(master, byRecovery)");
  });
});

describe("changing a password", () => {
  const route = read("app/api/auth/password/route.ts");

  it("opens the key before the password changes", () => {
    // Afterwards there would be nothing left to open it with.
    expect(route.indexOf("unlockWithPassword")).toBeLessThan(
      route.indexOf("data: { passwordHash: await hashPassword(password) }"),
    );
  });

  it("re-wraps rather than re-keys", () => {
    // The key does not change, so nothing already encrypted is rewritten — which is what makes
    // changing a password cheap instead of a migration of everything the account owns.
    expect(route).toContain("rewrapForNewPassword");
    expect(route).not.toContain("resetKey");
  });
});

describe("resetting a password", () => {
  const route = read("app/api/auth/reset/route.ts");

  it("refuses to silently abandon a key", () => {
    // Somebody who has mislaid the code for a minute should meet a refusal, not a fresh key and
    // a year of unreadable meetings.
    expect(route).toContain("needsRecoveryCode: true");
    expect(route).toContain("status: 409");
  });

  it("keeps everything when the code is given", () => {
    expect(route).toContain("unlockWithRecoveryCode");
    expect(route).toContain("rewrapForNewPassword");
  });

  it("starts again only when that was said out loud", () => {
    expect(route).toContain("body?.startOver === true");
    // The branch, not just the flag: reading the flag and then ignoring it is the failure.
    expect(route).toContain("} else if (startOver) {");
    expect(route).toContain("resetKey(spent.userId, password)");
  });
});
