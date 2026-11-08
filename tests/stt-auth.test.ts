import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { meetingSttToken, sttServerHeaders } from "@/lib/stt/auth";

// The web app's half of who may ask the transcription service for anything. The other half is
// stt-service/auth.py, and stt-service/test_auth.py checks it against these same tokens: if
// either side changes how it signs, both fail rather than recording quietly stopping.

const SECRET = "test-secret";
const EXP = 2000000000;
const NOW = (EXP - 300) * 1000;

describe("signing", () => {
  it("signs a request the way the service checks it", () => {
    expect(sttServerHeaders({ secret: SECRET, now: NOW })).toEqual({
      "x-voxinq-stt": `s.${EXP}.Zq026w3Ywbtr1WUCiq_A4-hBtzkUYH-wyGhiKUFMhhU`,
    });
  });

  it("issues a meeting's token the way the service checks it", () => {
    const t = meetingSttToken("cm0meeting1", { secret: SECRET, now: (EXP - 600) * 1000, ttl: 600 });
    expect(t).toEqual({
      token: `m.cm0meeting1.${EXP}.Nc5ImLVkC8a8nHY2Iq1WmuNT9jh-EKR-mQ2m5Fojmyk`,
      expiresAt: EXP * 1000,
    });
    const none = meetingSttToken(null, { secret: SECRET, now: (EXP - 600) * 1000, ttl: 600 });
    expect(none?.token).toBe(`m.-.${EXP}.h43xZpXJbWueRQSbncSyrn4PGh4BNbSGiX4niI6YUSI`);
  });

  it("signs nothing without a secret, as the service then checks nothing", () => {
    expect(sttServerHeaders({ secret: "" })).toEqual({});
    expect(meetingSttToken("cm0meeting1", { secret: "" })).toBeNull();
  });
});

describe("every way to the service", () => {
  const root = join(__dirname, "..");
  const files = (dir: string): string[] =>
    readdirSync(join(root, dir)).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(join(root, path)).isDirectory()) return files(path);
      return /\.(ts|tsx)$/.test(name) ? [path] : [];
    });
  const source = [...files("app"), ...files("lib")].map((f) => ({
    file: relative(root, join(root, f)).replace(/\\/g, "/"),
    text: readFileSync(join(root, f), "utf8"),
  }));

  it("goes through sttFetch from the server, which signs it", () => {
    // A bare fetch works on an instance without a secret and fails on every other.
    const bare = source.filter(
      (s) => s.file !== "lib/stt/internal.ts" && /fetch\(\s*`\$\{(sttInternalUrl\(\)|STT_INTERNAL_URL)\}/.test(s.text),
    );
    expect(bare.map((s) => s.file)).toEqual([]);
    const constant = source.filter((s) => /process\.env\.STT_INTERNAL_URL/.test(s.text) && s.file !== "lib/stt/internal.ts");
    expect(constant.map((s) => s.file)).toEqual([]);
  });

  it("from the browser, reaches only /health directly; the rest goes through the app", () => {
    const direct = source.flatMap((s) =>
      [...s.text.matchAll(/`\$\{sttHttpBase\(\)\}(\/[^`]*)`/g)].map((m) => `${s.file} ${m[1]}`),
    );
    expect(direct.every((d) => d.endsWith(" /health"))).toBe(true);
    expect(direct.length).toBeGreaterThan(0);
  });

  it("checks the meeting is the reader's own before relaying anything about it", () => {
    for (const route of [
      "app/api/meetings/[id]/recording/audio/route.ts",
      "app/api/meetings/[id]/recording/protect/route.ts",
      "app/api/meetings/[id]/stt-token/route.ts",
    ]) {
      expect(readFileSync(join(root, route), "utf8"), route).toContain("if (!(await readerOwns(id)))");
    }
    expect(readFileSync(join(root, "app/api/meetings/[id]/recording/route.ts"), "utf8")).toMatch(
      /export async function GET[\s\S]*?readerOwns\(id\)/,
    );
    for (const route of ["app/api/stt/states/route.ts", "app/api/stt/activity/route.ts"]) {
      expect(readFileSync(join(root, route), "utf8"), route).toContain("readerOwnsOf(");
    }
  });

  it("sends a recording's token with its start message", () => {
    expect(readFileSync(join(root, "lib/stt/client.ts"), "utf8")).toContain("sock.send(startPayload(t))");
    expect(readFileSync(join(root, "lib/stt/native.ts"), "utf8")).toContain("...opts, token, micMode");
  });
});
