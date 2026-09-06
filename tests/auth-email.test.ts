import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "..");
import { looksLikeEmail, normaliseEmail } from "../lib/auth/email";

// The address is an identifier, not a channel — nothing is ever sent to it. So what matters here
// is that two spellings of the same address cannot become two accounts, and that the obvious
// wrong things are caught.

describe("normalising an address", () => {
  it("folds case and surrounding space", () => {
    expect(normaliseEmail("  Sam@Example.COM ")).toBe("sam@example.com");
  });
});

describe("what counts as an address", () => {
  it("accepts the ordinary ones", () => {
    for (const v of ["sam@example.com", "sasaki.tkfm@gmail.com", "a+tag@sub.example.co.jp"]) {
      expect(looksLikeEmail(v), v).toBe(true);
    }
  });

  it("catches a username typed into the wrong box", () => {
    // The failure this is really for: the login form used to take a username, and muscle memory
    // outlives a form change.
    expect(looksLikeEmail("sam")).toBe(false);
  });

  it("catches the empty and the malformed", () => {
    for (const v of ["", "   ", "@example.com", "sam@", "sam@example", "sam @example.com"]) {
      expect(looksLikeEmail(v), JSON.stringify(v)).toBe(false);
    }
  });

  it("refuses one longer than an address can be", () => {
    expect(looksLikeEmail(`${"a".repeat(250)}@example.com`)).toBe(false);
  });
});

describe("where an account gets its address", () => {
  const read = (p: string) => readFileSync(join(root, p), "utf8");

  it("from the tailnet identity, which already is one", () => {
    // The backfill in the migration does the same for accounts that predate the column. Between
    // them, nobody who could sign in yesterday has to be told anything today.
    expect(read("lib/auth/session.ts")).toContain('email: login.includes("@") ? login.toLowerCase() : null');
    expect(read("prisma/migrations/20260908120000_add_user_email/migration.sql")).toContain(
      'UPDATE "users" SET "email" = lower("tailscale_login")',
    );
  });

  it("and is required of every screen that makes one", () => {
    // An account with a password and no address can only be reached from inside the tailnet,
    // which is a locked door nobody chose. So every path that creates one asks.
    for (const route of ["app/api/auth/setup/route.ts", "app/api/admin/users/route.ts"]) {
      expect(read(route), route).toContain("looksLikeEmail(email)");
    }
  });

  it("and can be corrected by the person it belongs to", () => {
    // Where an account that predates the column gets one, and where a typo is fixed.
    expect(read("app/api/auth/profile/route.ts")).toContain('form.has("email")');
    expect(read("app/api/auth/profile/route.ts")).toContain("That email address is already in use.");
  });
});
