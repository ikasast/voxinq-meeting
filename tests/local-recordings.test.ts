import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DB_NAME, wavHeader } from "@/lib/local-recordings";

const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

describe("recordings kept in the browser", () => {
  it("makes 16 kHz mono 16-bit PCM a WAV file", () => {
    const h = new DataView(wavHeader(32_000));
    const ascii = (at: number) => String.fromCharCode(...new Uint8Array(h.buffer, at, 4));
    expect(h.byteLength).toBe(44);
    expect(ascii(0)).toBe("RIFF");
    expect(ascii(8)).toBe("WAVE");
    expect(h.getUint32(4, true)).toBe(36 + 32_000);
    expect(h.getUint16(22, true)).toBe(1); // mono
    expect(h.getUint32(24, true)).toBe(16_000);
    expect(h.getUint32(28, true)).toBe(32_000); // bytes per second
    expect(h.getUint16(34, true)).toBe(16);
    expect(h.getUint32(40, true)).toBe(32_000);
  });

  // The offline page cannot import the module, so it repeats the database's shape.
  it("is written by the offline page in the shape the app reads", () => {
    const page = read("public/offline.html");
    expect(page).toContain(`indexedDB.open("${DB_NAME}", 1)`);
    expect(page).toContain(`createObjectStore("recordings", { keyPath: "id" })`);
    expect(page).toContain(`createObjectStore("chunks", { keyPath: ["id", "seq"] })`);
    const lib = read("lib/local-recordings.ts");
    expect(lib).toContain("const DB_VERSION = 1;");
    expect(lib).toContain(`createObjectStore("recordings", { keyPath: "id" })`);
    expect(lib).toContain(`createObjectStore("chunks", { keyPath: ["id", "seq"] })`);
  });

  it("serves the offline page without a login, from the one cache the worker keeps", () => {
    expect(read("proxy.ts")).toMatch(/matcher:[\s\S]*offline\.html/);
    const sw = read("public/sw.js");
    expect(sw).toContain(`const OFFLINE_URL = "/offline.html";`);
    expect(sw).toMatch(/name !== OFFLINE_CACHE/);
  });
});
