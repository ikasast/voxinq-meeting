import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../lib/auth/password";

describe("password hashing", () => {
  it("accepts the right password and refuses the wrong one", async () => {
    const stored = await hashPassword("correct horse battery staple");
    expect(await verifyPassword("correct horse battery staple", stored)).toBe(true);
    expect(await verifyPassword("Correct horse battery staple", stored)).toBe(false);
    expect(await verifyPassword("", stored)).toBe(false);
  });

  it("salts, so two accounts with one password do not look alike", async () => {
    const a = await hashPassword("same password");
    const b = await hashPassword("same password");
    expect(a).not.toBe(b);
    expect(await verifyPassword("same password", a)).toBe(true);
    expect(await verifyPassword("same password", b)).toBe(true);
  });

  it("carries its parameters, so they can be raised later", async () => {
    const stored = await hashPassword("x".repeat(12));
    const [scheme, N, r, p] = stored.split("$");
    expect(scheme).toBe("scrypt");
    expect(Number(N)).toBeGreaterThanOrEqual(16384);
    expect(Number(r)).toBe(8);
    expect(Number(p)).toBe(1);
  });

  it("says no to a missing or damaged hash instead of throwing", async () => {
    // A corrupt row should refuse one login, not 500 the login route for everybody.
    for (const bad of [null, "", "not-a-hash", "scrypt$$$$", "argon2$1$2$3$4$5", "scrypt$a$b$c$d$e"]) {
      expect(await verifyPassword("anything", bad)).toBe(false);
    }
  });

  it("refuses a hash whose stored digest is the wrong length", async () => {
    // Not a formality. The first version of this derived the key length from the stored hash,
    // and scrypt's output truncated to n bytes is the prefix of its full output — so a row
    // edited down to a few bytes accepted the password anyway, and a one-byte one would have
    // accepted roughly one password in 256.
    const stored = await hashPassword("hello there");
    const truncated = stored.slice(0, stored.length - 8);
    expect(await verifyPassword("hello there", truncated)).toBe(false);

    const [scheme, N, r, p, salt] = stored.split("$");
    expect(await verifyPassword("hello there", `${scheme}$${N}$${r}$${p}$${salt}$AA==`)).toBe(false);
  });
});
