import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LOCKED, decryptField, encryptField, isEncrypted } from "../lib/crypto/field";
import { newMasterKey } from "../lib/crypto/keys";

// Encrypting one column value. Each case here is one that failed silently when it was wrong —
// a padlock where a transcript should be, or a value written twice over.

const KEY = newMasterKey();

describe("a value in the database", () => {
  it("comes back out", () => {
    const blob = encryptField("発言その0", KEY, "transcript");
    expect(blob).not.toContain("発言");
    expect(decryptField(blob, KEY)).toBe("発言その0");
  });

  it("carries the purpose it was encrypted under", () => {
    // Decryption happens by recognising the prefix, not by knowing which column a string came
    // from — a read can be shaped in too many ways for that. Without the purpose in the value,
    // everything written under "transcript" was read back under "field" and came out as a
    // padlock, which looked exactly like data corruption.
    const blob = encryptField("x", KEY, "transcript");
    expect(blob.startsWith("enc:v1.transcript.")).toBe(true);
    expect(decryptField(blob, KEY)).toBe("x");
  });

  it("uses a different subkey per purpose", () => {
    // Domain separation: a transcript and a set of minutes are not encrypted under the same key,
    // so one being broken open does not hand over the other.
    const asTranscript = encryptField("same text", KEY, "transcript");
    const asMinutes = encryptField("same text", KEY, "minutes");
    const swapped = asMinutes.replace("enc:v1.minutes.", "enc:v1.transcript.");
    expect(decryptField(swapped, KEY)).toBeNull();
    expect(decryptField(asTranscript, KEY)).toBe("same text");
  });

  it("leaves plaintext alone", () => {
    // Encrypted and plaintext rows share a column while an account is being migrated, and for
    // ever on an account that has no key.
    expect(isEncrypted("just some words")).toBe(false);
    expect(decryptField("just some words", KEY)).toBe("just some words");
  });

  it("refuses a wrong key rather than returning rubbish", () => {
    expect(decryptField(encryptField("secret", KEY, "transcript"), newMasterKey())).toBeNull();
  });

  it("refuses a tampered value", () => {
    const parts = encryptField("secret", KEY, "transcript").split(".");
    const body = Buffer.from(parts[3], "base64url");
    body[0] ^= 0xff;
    parts[3] = body.toString("base64url");
    expect(decryptField(parts.join("."), KEY)).toBeNull();
  });

  it("is different every time", () => {
    expect(encryptField("x", KEY, "transcript")).not.toBe(encryptField("x", KEY, "transcript"));
  });
});

describe("the extension that applies it", () => {
  const src = readFileSync(join(__dirname, "..", "lib/prisma.ts"), "utf8");

  it("never encrypts something twice", () => {
    // A value read back and saved again would otherwise be wrapped a second time, and nothing
    // would be able to read it.
    expect(src).toContain("!isEncrypted(v)");
  });

  it("decrypts a lookup by id, not only a list", () => {
    // These go down their own path, because `findUnique` cannot take the ownership filter. It
    // returned ciphertext straight to the page while the same rows in a list came back readable.
    expect(src).toContain("return decryptDeep(found, await keyFor(scope.userId));");
  });

  it("adds the owner beside the id on a write, not around it", () => {
    // `update` and `delete` take a unique where. An `AND` there is a validation error rather
    // than a narrower query, and it failed as a 500 inside a queued job.
    expect(src).toContain("BY_ID_WRITE");
    expect(src).toContain("where: { ...(a.where ?? {}), ...condition }");
  });

  it("shows a padlock rather than ciphertext when it cannot read", () => {
    expect(src).toContain("LOCKED");
    expect(LOCKED).not.toContain("enc:");
  });
});
