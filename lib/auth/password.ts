import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

// Password hashing, with what Node already has.
//
// scrypt rather than Argon2id, which the encryption design will want later: Argon2 means a
// native dependency, and this app is installed from a Docker image, a Homebrew tap and a Scoop
// bucket on three operating systems. A native module that fails to build on one of them turns
// "install it" into "debug it". scrypt is memory-hard, in the standard library, and the thing
// it protects here is a password on a machine the user already owns.
//
// Stored as `scrypt$N$r$p$salt$hash`, so the parameters travel with the hash and can be raised
// later without invalidating what is already stored.

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

const N = 16384; // ~16 MB with r=8; a login should cost about 100ms
const r = 8;
const p = 1;
const KEYLEN = 32;
const maxmem = 64 * 1024 * 1024;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, KEYLEN, { N, r, p, maxmem });
  return `scrypt$${N}$${r}$${p}$${salt.toString("base64")}$${key.toString("base64")}`;
}

/**
 * Check a password against a stored hash.
 *
 * Returns false rather than throwing for anything malformed: a corrupt row should refuse the
 * login, not crash the login route for everybody.
 */
export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, sN, sr, sp, salt64, hash64] = parts;
  const params = { N: Number(sN), r: Number(sr), p: Number(sp), maxmem };
  if (!Number.isInteger(params.N) || !Number.isInteger(params.r) || !Number.isInteger(params.p)) {
    return false;
  }
  try {
    const expected = Buffer.from(hash64, "base64");
    // The length is fixed here, never taken from the stored value. Deriving `keylen` from what
    // is stored would make a truncated hash verify: scrypt's output cut to n bytes is the
    // prefix of its full output, so a row edited down to a few bytes would accept almost
    // anything. The stored digest has to be exactly the length this function produces.
    if (expected.length !== KEYLEN) return false;
    const actual = await scrypt(password, Buffer.from(salt64, "base64"), KEYLEN, params);
    // Checked before comparing because timingSafeEqual throws on a length mismatch rather than
    // returning false, and a thrown login is a 500 where a "no" belongs.
    return actual.length === KEYLEN && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}
