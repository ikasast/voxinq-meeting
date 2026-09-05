// The session cookie, and the part of it the proxy can check on its own.
//
// The value is `<sessionId>.<expiry>.<hmac>`. The proxy verifies the signature and the expiry
// without touching the database, which keeps it cheap — it runs for every request, including
// ones that never read anything. That check is a gate, not the authorization: the session row
// is what says whether this session still exists, and it is read where data is.
//
// This split is deliberate, and the Next.js proxy documentation asks for it in as many words:
// a matcher change or a moved route can silently remove proxy coverage, so authentication and
// authorization have to be verified where the data is, not only in front of it.

export const SESSION_COOKIE = "voxinq_session";

/** 30 days, matching what the shared-password cookie did before this existed. */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function secret(): string {
  return process.env.APP_SESSION_SECRET ?? "voxinq-default-secret";
}

async function sign(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return Buffer.from(new Uint8Array(mac)).toString("base64url");
}

export async function packSession(sessionId: string, expiresAt: Date): Promise<string> {
  const payload = `${sessionId}.${expiresAt.getTime()}`;
  return `${payload}.${await sign(payload)}`;
}

/**
 * Read a cookie back.
 *
 * Null for anything that is not this server's, or has expired. Comparison is constant-time
 * over the whole string: an attacker who can time a forgery attempt can otherwise recover a
 * signature a byte at a time.
 */
export async function unpackSession(value: string | undefined | null): Promise<string | null> {
  if (!value) return null;
  const at = value.lastIndexOf(".");
  if (at <= 0) return null;
  const payload = value.slice(0, at);
  const mac = value.slice(at + 1);
  const expected = await sign(payload);
  if (!constantTimeEqual(mac, expected)) return null;
  const [sessionId, expiry] = payload.split(".");
  if (!sessionId || !expiry) return null;
  const ms = Number(expiry);
  if (!Number.isFinite(ms) || ms <= Date.now()) return null;
  return sessionId;
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
