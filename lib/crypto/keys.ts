import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scrypt as scryptCb,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";

// The key material each account's data is encrypted under.
//
// One random master key per person. Everything of theirs is encrypted under keys derived from
// it, and the master key itself is never stored in the clear — only wrapped, twice:
//
//   by their password        so signing in unlocks their data
//   by a recovery code       so forgetting the password does not destroy it
//
// Both wrappings hold the same key, so either one opens everything. Neither the server nor an
// administrator holds a third copy, which is the entire point: an administrator can issue a
// reset link, and a reset without the recovery code produces an account that can sign in and
// cannot read what it wrote before. That is not a bug to be fixed later — it is the property
// being bought, and it has to be said plainly wherever somebody might be surprised by it.
//
// **A symmetric master key rather than the keypair the plan sketched.** A keypair would let the
// server encrypt new data without being able to read any, which is worth having when writes
// happen while nobody is signed in. Here they do not: recording happens with the person present,
// and a queued job runs as its owner and waits for their key rather than running without it. So
// the keypair would add a moving part and buy nothing.

const scrypt = promisify(scryptCb) as (
  secret: string | Buffer,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

/** Deliberately heavier than the login hash: this one guards everything, not one session. */
const KDF = { N: 32768, r: 8, p: 1, maxmem: 128 * 1024 * 1024 };
const KEY_BYTES = 32;
const IV_BYTES = 12;

/**
 * A key for one purpose, derived from the master.
 *
 * So that the search index and the transcripts are not encrypted under the same key: one being
 * broken open should not hand over the other, and the index is the more exposed of the two
 * because its tokens are stored in a form built to be matched against.
 */
export function fieldSubkey(master: Buffer, purpose: string): Buffer {
  return createHash("sha256").update(master).update(" ").update(purpose).digest();
}

export function newMasterKey(): Buffer {
  return randomBytes(KEY_BYTES);
}

/**
 * A recovery code, in the shape people can actually copy down.
 *
 * Crockford's alphabet, so there is no I/l/1 or O/0 to mistype, in groups of five. 100 bits of
 * entropy, which is not a password anybody is expected to remember — it is written down or put
 * in a password manager, once.
 */
export function newRecoveryCode(): string {
  const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  const bytes = randomBytes(20);
  let out = "";
  for (let i = 0; i < 20; i++) {
    if (i > 0 && i % 5 === 0) out += "-";
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}

/** Fold away the shape of a typed code, so spacing and case are not a reason to be refused. */
export function normaliseRecoveryCode(code: string): string {
  return code.toUpperCase().replace(/[^0-9A-Z]/g, "");
}

export function newSalt(): string {
  return randomBytes(16).toString("base64");
}

/** Turn a password or a recovery code into something that can unwrap the master key. */
export async function wrappingKey(secret: string, salt: string): Promise<Buffer> {
  return scrypt(secret, Buffer.from(salt, "base64"), KEY_BYTES, KDF);
}

/**
 * Wrap the master key. `v1.<iv>.<ciphertext>.<tag>`, base64url throughout.
 *
 * AES-256-GCM, so a wrong key fails the tag check instead of returning plausible rubbish — the
 * difference between "that is not your password" and thirty-two random bytes being used as a
 * key on data that then decrypts to nothing.
 */
export function wrapKey(master: Buffer, wrapping: Buffer): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", wrapping, iv);
  const body = Buffer.concat([cipher.update(master), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), body.toString("base64url"), tag.toString("base64url")].join(
    ".",
  );
}

/** Unwrap it, or null. Null for a wrong key, a damaged row, or anything that is not a wrapping. */
export function unwrapKey(blob: string | null, wrapping: Buffer): Buffer | null {
  if (!blob) return null;
  const parts = blob.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") return null;
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      wrapping,
      Buffer.from(parts[1], "base64url"),
    );
    decipher.setAuthTag(Buffer.from(parts[3], "base64url"));
    const out = Buffer.concat([
      decipher.update(Buffer.from(parts[2], "base64url")),
      decipher.final(),
    ]);
    return out.length === KEY_BYTES ? out : null;
  } catch {
    // The tag check failing is the ordinary case here — it is what a wrong password looks like.
    return null;
  }
}

/** For comparing two keys without leaking where they differ. */
export function sameKey(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}
