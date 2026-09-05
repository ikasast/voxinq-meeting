import { describe, expect, it } from "vitest";
import {
  newMasterKey,
  newRecoveryCode,
  newSalt,
  normaliseRecoveryCode,
  sameKey,
  unwrapKey,
  wrapKey,
  wrappingKey,
} from "../lib/crypto/keys";

// The key that everything else will hang off. Every case here is one where being wrong would be
// silent: a wrapping that opens with the wrong secret, a code that only works if typed exactly
// as displayed, a corrupt row that throws where it should say no.

describe("wrapping a key", () => {
  it("comes back out with the right secret", async () => {
    const master = newMasterKey();
    const salt = newSalt();
    const blob = wrapKey(master, await wrappingKey("a good long password", salt));
    const out = unwrapKey(blob, await wrappingKey("a good long password", salt));
    expect(out).not.toBeNull();
    expect(sameKey(out!, master)).toBe(true);
  });

  it("does not come out with the wrong one", async () => {
    const salt = newSalt();
    const blob = wrapKey(newMasterKey(), await wrappingKey("right", salt));
    expect(unwrapKey(blob, await wrappingKey("wrong", salt))).toBeNull();
  });

  it("does not come out with the right secret and a different salt", async () => {
    const blob = wrapKey(newMasterKey(), await wrappingKey("same", newSalt()));
    expect(unwrapKey(blob, await wrappingKey("same", newSalt()))).toBeNull();
  });

  it("says no to rubbish rather than throwing", async () => {
    const key = await wrappingKey("x", newSalt());
    for (const bad of [null, "", "v1", "v1.a.b", "v2.a.b.c", "not-a-wrapping"]) {
      expect(unwrapKey(bad, key)).toBeNull();
    }
  });

  it("detects a tampered ciphertext instead of returning rubbish", async () => {
    // GCM's tag is the difference between "that is not your password" and thirty-two arbitrary
    // bytes being used as a key on data that then decrypts to nothing.
    const salt = newSalt();
    const key = await wrappingKey("pw", salt);
    const parts = wrapKey(newMasterKey(), key).split(".");
    const body = Buffer.from(parts[2], "base64url");
    body[0] ^= 0xff;
    parts[2] = body.toString("base64url");
    expect(unwrapKey(parts.join("."), key)).toBeNull();
  });

  it("is a different blob every time, for the same key and secret", async () => {
    // A fresh IV each time, so two accounts with the same password do not produce the same row.
    const master = newMasterKey();
    const salt = newSalt();
    const key = await wrappingKey("same password", salt);
    expect(wrapKey(master, key)).not.toBe(wrapKey(master, key));
  });

  it("opens the same key from either wrapping", async () => {
    // The property the whole recovery story rests on: two secrets, one key.
    const master = newMasterKey();
    const salt = newSalt();
    const code = newRecoveryCode();
    const byPassword = wrapKey(master, await wrappingKey("pw", salt));
    const byCode = wrapKey(master, await wrappingKey(normaliseRecoveryCode(code), salt));
    const a = unwrapKey(byPassword, await wrappingKey("pw", salt))!;
    const b = unwrapKey(byCode, await wrappingKey(normaliseRecoveryCode(code), salt))!;
    expect(sameKey(a, b)).toBe(true);
  });
});

describe("the recovery code", () => {
  it("avoids the characters people mistype", () => {
    // Crockford's alphabet: no I, L, O or U, so there is no i/1/l or O/0 to get wrong when
    // copying it off a screen onto paper.
    for (let i = 0; i < 20; i++) {
      expect(newRecoveryCode()).not.toMatch(/[ILOU]/);
    }
  });

  it("is grouped, and worth about a hundred bits", () => {
    const code = newRecoveryCode();
    expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{5}(-[0-9A-HJKMNP-TV-Z]{5}){3}$/);
  });

  it("does not repeat", () => {
    const seen = new Set(Array.from({ length: 200 }, () => newRecoveryCode()));
    expect(seen.size).toBe(200);
  });

  it("is accepted however it was typed back", async () => {
    // Somebody reading it off paper adds spaces, drops the dashes, uses lower case. None of
    // that should be a reason to tell them their only copy is wrong.
    const code = newRecoveryCode();
    const salt = newSalt();
    const blob = wrapKey(newMasterKey(), await wrappingKey(normaliseRecoveryCode(code), salt));
    for (const typed of [
      code,
      code.toLowerCase(),
      code.replace(/-/g, ""),
      code.replace(/-/g, " "),
      `  ${code.toLowerCase()}  `,
    ]) {
      const out = unwrapKey(blob, await wrappingKey(normaliseRecoveryCode(typed), salt));
      expect(out, `rejected "${typed}"`).not.toBeNull();
    }
  });
});
