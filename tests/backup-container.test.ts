import { describe, expect, it } from "vitest";
import {
  BadFormatError,
  UnsupportedVersionError,
  WrongPasswordError,
  decryptContainer,
  encryptContainer,
  isBackupFile,
} from "../lib/backup/container";

const PAYLOAD = Buffer.from("meeting minutes, an api key, and a WAV or two", "utf8");

describe("backup container", () => {
  it("round-trips a payload", async () => {
    const file = await encryptContainer(PAYLOAD, "correct horse battery staple");
    const out = await decryptContainer(file, "correct horse battery staple");
    expect(out.equals(PAYLOAD)).toBe(true);
  });

  it("round-trips an empty payload", async () => {
    const file = await encryptContainer(Buffer.alloc(0), "pw");
    expect((await decryptContainer(file, "pw")).length).toBe(0);
  });

  it("rejects the wrong password rather than returning garbage", async () => {
    const file = await encryptContainer(PAYLOAD, "right");
    await expect(decryptContainer(file, "wrong")).rejects.toBeInstanceOf(WrongPasswordError);
  });

  it("rejects a password that differs only in case", async () => {
    const file = await encryptContainer(PAYLOAD, "Secret");
    await expect(decryptContainer(file, "secret")).rejects.toBeInstanceOf(WrongPasswordError);
  });

  it("detects a single flipped byte in the ciphertext", async () => {
    const file = await encryptContainer(PAYLOAD, "pw");
    file[60] ^= 0x01;
    await expect(decryptContainer(file, "pw")).rejects.toBeInstanceOf(WrongPasswordError);
  });

  it("detects a tampered authentication tag", async () => {
    const file = await encryptContainer(PAYLOAD, "pw");
    file[file.length - 1] ^= 0xff;
    await expect(decryptContainer(file, "pw")).rejects.toBeInstanceOf(WrongPasswordError);
  });

  it("rejects a file that is not a backup", async () => {
    await expect(decryptContainer(Buffer.from("just a text file", "utf8"), "pw")).rejects.toBeInstanceOf(
      BadFormatError,
    );
  });

  it("rejects a truncated file", async () => {
    const file = await encryptContainer(PAYLOAD, "pw");
    await expect(decryptContainer(file.subarray(0, 20), "pw")).rejects.toBeInstanceOf(BadFormatError);
  });

  it("refuses a file written by a newer Voxinq", async () => {
    const file = await encryptContainer(PAYLOAD, "pw");
    file.writeUInt16BE(2, 6);
    await expect(decryptContainer(file, "pw")).rejects.toBeInstanceOf(UnsupportedVersionError);
  });

  it("refuses implausible key-derivation parameters", async () => {
    const file = await encryptContainer(PAYLOAD, "pw");
    file.writeUInt8(30, 9); // log2(N) = 30 would ask for gigabytes
    await expect(decryptContainer(file, "pw")).rejects.toBeInstanceOf(BadFormatError);
  });

  it("uses a fresh salt and IV per file, so identical payloads differ", async () => {
    const a = await encryptContainer(PAYLOAD, "pw");
    const b = await encryptContainer(PAYLOAD, "pw");
    expect(a.equals(b)).toBe(false);
    expect(a.subarray(12, 28).equals(b.subarray(12, 28))).toBe(false); // salt
    expect(a.subarray(28, 40).equals(b.subarray(28, 40))).toBe(false); // iv
  });

  it("leaves no recognizable plaintext in the file", async () => {
    const file = await encryptContainer(Buffer.from("sk-ant-secret-key-value"), "pw");
    expect(file.includes(Buffer.from("sk-ant-secret-key-value"))).toBe(false);
  });

  it("recognizes its own files without a password", async () => {
    expect(isBackupFile(await encryptContainer(PAYLOAD, "pw"))).toBe(true);
    expect(isBackupFile(Buffer.from("PK a zip file"))).toBe(false);
  });

  it("requires a password to encrypt", async () => {
    await expect(encryptContainer(PAYLOAD, "")).rejects.toThrow(/password/);
  });

  it("handles a payload larger than one cipher block boundary", async () => {
    const big = Buffer.alloc(1024 * 512, 7);
    const file = await encryptContainer(big, "pw");
    expect((await decryptContainer(file, "pw")).equals(big)).toBe(true);
  });
});
