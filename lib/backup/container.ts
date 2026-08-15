// The encrypted container a backup file is wrapped in.
//
// A backup holds every transcript, plus settings.json with its API keys in the clear. It is
// meant to be copied to another machine or a USB stick, so the file itself has to be useless
// to anyone without the password — not merely inconvenient. Hence authenticated encryption
// with a key derived from the password, and a header that says exactly how, so a file written
// today still opens after the parameters are raised.
//
// Layout:
//
//   0   8   magic: "VOXBAK" + uint16 format version
//   8   1   KDF id (1 = scrypt)
//   9   3   scrypt log2(N), r, p
//   12  16  scrypt salt
//   28  12  AES-GCM IV
//   40  4   reserved (zero)
//   44  ..  AES-256-GCM ciphertext
//   -16     GCM authentication tag
//
// The reserved bytes exist so a version 2 can describe chunked encryption without changing
// the shape of the header: today the whole payload is encrypted in one piece, which caps a
// backup at what fits in memory (see lib/backup/export.ts).

import { createCipheriv, createDecipheriv, randomBytes, scrypt as scryptCb } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

const MAGIC = Buffer.from("VOXBAK", "ascii");
export const FORMAT_VERSION = 1;
const KDF_SCRYPT = 1;

const HEADER_LEN = 44;
const SALT_LEN = 16;
const IV_LEN = 12;
const TAG_LEN = 16;
const KEY_LEN = 32;

// ~100ms and 32 MiB on a desktop CPU: slow enough to make guessing a weak password expensive,
// fast enough that nobody notices it on their own backup.
const SCRYPT_LOG_N = 15;
const SCRYPT_R = 8;
const SCRYPT_P = 1;

/** Node's default scrypt maxmem is exactly 32 MiB, which N=2^15,r=8 sits on — it must be raised
 *  explicitly or every derivation throws. */
function maxmemFor(logN: number, r: number): number {
  return Math.max(160 * (1 << logN) * r, 64 * 1024 * 1024);
}

export class BadFormatError extends Error {
  constructor(message = "not a Voxinq backup file") {
    super(message);
    this.name = "BadFormatError";
  }
}

export class UnsupportedVersionError extends Error {
  constructor(public readonly version: number) {
    super(`backup format version ${version} is newer than this Voxinq understands`);
    this.name = "UnsupportedVersionError";
  }
}

export class WrongPasswordError extends Error {
  constructor() {
    super("wrong password, or the file is damaged");
    this.name = "WrongPasswordError";
  }
}

async function deriveKey(
  password: string,
  salt: Buffer,
  logN: number,
  r: number,
  p: number,
): Promise<Buffer> {
  return scrypt(password, salt, KEY_LEN, {
    N: 1 << logN,
    r,
    p,
    maxmem: maxmemFor(logN, r),
  });
}

/** Wrap a payload in the encrypted container. */
export async function encryptContainer(plaintext: Buffer, password: string): Promise<Buffer> {
  if (!password) throw new Error("a password is required");

  const salt = randomBytes(SALT_LEN);
  const iv = randomBytes(IV_LEN);
  const key = await deriveKey(password, salt, SCRYPT_LOG_N, SCRYPT_R, SCRYPT_P);

  const header = Buffer.alloc(HEADER_LEN);
  MAGIC.copy(header, 0);
  header.writeUInt16BE(FORMAT_VERSION, 6);
  header.writeUInt8(KDF_SCRYPT, 8);
  header.writeUInt8(SCRYPT_LOG_N, 9);
  header.writeUInt8(SCRYPT_R, 10);
  header.writeUInt8(SCRYPT_P, 11);
  salt.copy(header, 12);
  iv.copy(header, 28);

  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([header, body, cipher.getAuthTag()]);
}

/**
 * Unwrap a container.
 *
 * Throws {@link BadFormatError} when the file is not one of ours, {@link UnsupportedVersionError}
 * when it came from a newer Voxinq, and {@link WrongPasswordError} when the key does not
 * authenticate — GCM verifies the tag before returning anything, so a wrong password can never
 * yield garbage that looks like a payload.
 */
export async function decryptContainer(file: Buffer, password: string): Promise<Buffer> {
  // Cheap structural checks first: no reason to spend 100ms deriving a key for a JPEG.
  if (file.length < HEADER_LEN + TAG_LEN) throw new BadFormatError();
  if (!file.subarray(0, 6).equals(MAGIC)) throw new BadFormatError();

  const version = file.readUInt16BE(6);
  if (version > FORMAT_VERSION) throw new UnsupportedVersionError(version);

  const kdf = file.readUInt8(8);
  if (kdf !== KDF_SCRYPT) throw new BadFormatError(`unknown key derivation (id ${kdf})`);

  const logN = file.readUInt8(9);
  const r = file.readUInt8(10);
  const p = file.readUInt8(11);
  // A hostile file could ask for parameters that exhaust memory; bound them to something a
  // real backup would use.
  if (logN < 10 || logN > 20 || r < 1 || r > 32 || p < 1 || p > 16) {
    throw new BadFormatError("implausible key derivation parameters");
  }

  const salt = file.subarray(12, 12 + SALT_LEN);
  const iv = file.subarray(28, 28 + IV_LEN);
  const body = file.subarray(HEADER_LEN, file.length - TAG_LEN);
  const tag = file.subarray(file.length - TAG_LEN);

  const key = await deriveKey(password, salt, logN, r, p);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(body), decipher.final()]);
  } catch {
    throw new WrongPasswordError();
  }
}

/** Whether a file looks like one of ours, without needing the password. */
export function isBackupFile(file: Buffer): boolean {
  return file.length >= HEADER_LEN + TAG_LEN && file.subarray(0, 6).equals(MAGIC);
}
