import { beforeAll, describe, expect, it } from "vitest";
import { packSession, unpackSession } from "../lib/auth/cookie";

// The cookie the proxy checks without a database. It proves this server issued it and that it
// has not expired — and nothing about whether the session still exists, which is why the proxy
// reads the row as well.

beforeAll(() => {
  process.env.APP_SESSION_SECRET = "a-test-secret";
});

const hour = 60 * 60 * 1000;

describe("the session cookie", () => {
  it("round-trips the session id", async () => {
    const packed = await packSession("sess_123", new Date(Date.now() + hour));
    expect(await unpackSession(packed)).toBe("sess_123");
  });

  it("refuses one that has expired", async () => {
    expect(await unpackSession(await packSession("sess_123", new Date(Date.now() - 1000)))).toBeNull();
  });

  it("refuses a tampered session id", async () => {
    // The whole point: without the signature, the cookie is a userid you can type.
    const packed = await packSession("sess_123", new Date(Date.now() + hour));
    const forged = packed.replace("sess_123", "sess_456");
    expect(await unpackSession(forged)).toBeNull();
  });

  it("refuses a tampered expiry", async () => {
    const packed = await packSession("sess_123", new Date(Date.now() - 1000));
    const [id, , mac] = packed.split(".");
    expect(await unpackSession(`${id}.${Date.now() + hour}.${mac}`)).toBeNull();
  });

  it("refuses one signed with another secret", async () => {
    const packed = await packSession("sess_123", new Date(Date.now() + hour));
    process.env.APP_SESSION_SECRET = "a-different-secret";
    try {
      expect(await unpackSession(packed)).toBeNull();
    } finally {
      process.env.APP_SESSION_SECRET = "a-test-secret";
    }
  });

  it("refuses rubbish rather than throwing", async () => {
    for (const bad of [undefined, null, "", "no-dots", ".", "a.b"]) {
      expect(await unpackSession(bad)).toBeNull();
    }
  });
});
