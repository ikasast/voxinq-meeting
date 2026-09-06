import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Found by running it. Everything of an account's was encrypted, and inside a tailnet nobody
// ever types a password — the identity header settles who you are and carries nothing that opens
// data — so the key was never opened and, fifteen minutes after anything last touched it, nine
// thousand utterances read `🔒 encrypted` with nothing on screen to say why.

const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

describe("an account whose key is shut", () => {
  const layout = read("app/layout.tsx");

  it("is told so, rather than shown padlocks", () => {
    expect(layout).toContain("locked ? <LockedBanner /> : null");
    expect(read("app/locked-banner.tsx")).toContain("Your meetings are locked.");
  });

  it("is only called locked when there is something to unlock", () => {
    // An account with no key is not locked, it is unencrypted. Telling that person to unlock
    // something is a sentence about a thing they do not have.
    expect(layout).toContain("?.keySalt,\n      ) && !(await hasKey(me.id))");
  });

  it("can open it without being asked who it is again", () => {
    // Being identified and being able to read are different things here, and in a tailnet only
    // the first ever happens. So the password is asked for on its own — no email, because that
    // is already settled.
    const route = read("app/api/auth/unlock/route.ts");
    expect(route).toContain("unlockWithPassword(me.id, password)");
    expect(route).not.toContain("body?.email");
  });

  it("starts a session, so the key has a lifetime to hang from", () => {
    // A tailnet visit creates no session row — the header answers every request on its own — so
    // without this the key would be dropped fifteen minutes after the last read, however
    // recently somebody unlocked it. Verified against a running instance: a tailnet request
    // leaves the sessions table empty.
    expect(read("app/api/auth/unlock/route.ts")).toContain("startSession(me.id");
  });

  it("says the same thing however the unlock failed", () => {
    expect(read("app/api/auth/unlock/route.ts")).toContain("That is not your password.");
  });
});

describe("how long a key stays open", () => {
  const unlock = read("lib/crypto/unlock.ts");

  it("is as long as its owner is signed in", () => {
    // Idleness alone was the bug: it reduced, for anybody arriving through the tailnet, to
    // "never open". Signing in is something a person can see and control; idleness is not.
    expect(unlock).toContain("expiresAt: { gt: new Date() }");
    expect(unlock).toContain("const spare = new Set([...busy, ...signedIn.map((s) => s.userId)]);");
  });

  it("still ends when there is nobody and nothing", () => {
    // The key left behind by a session that has since expired.
    expect(unlock).toContain("lastUsedAt: { lt: new Date(Date.now() - IDLE_MS) }");
  });

  it("ends at once on signing out", () => {
    // Not on the dispatcher's next tick: "log me out" on a borrowed machine should not leave
    // the data readable for however long that is.
    expect(read("app/api/auth/logout/route.ts")).toContain("if (me) await dropKey(me.id);");
  });
});
