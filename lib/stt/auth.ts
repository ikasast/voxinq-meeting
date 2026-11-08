import { createHmac } from "node:crypto";

// What lets the transcription service tell the web app's requests from anybody else's.
//
// The service has no accounts: this side decides who owns a meeting, and signs to say so. Both
// are given the same STT_SECRET (compose derives it from POSTGRES_PASSWORD unless
// VOXINQ_STT_SECRET is set) and sign with a key derived from it. The other half, and the token
// formats, are stt-service/auth.py; tests/stt-auth.test.ts checks both against the same tokens.
//
// Without a secret nothing is signed, and a service without one checks nothing — how it was
// before. Administrators are told (lib/stt/auth-state.ts).

export const STT_AUTH_HEADER = "x-voxinq-stt";

/** How long the web server's signature on one request lasts. Clocks are the same machine's. */
const SERVER_TTL_S = 300;

/**
 * How long a recording's token lasts. Long, because the Android app reconnects with the one it
 * has when the web app cannot be reached, and a meeting can run past a short one; it fetches a
 * new one whenever it can.
 */
export const MEETING_TTL_S = 24 * 60 * 60;

function key(secret = process.env.STT_SECRET): Buffer | null {
  if (!secret) return null;
  return createHmac("sha256", secret).update("voxinq-stt-v1").digest();
}

function sign(message: string, k: Buffer): string {
  return createHmac("sha256", k).update(message).digest("base64url");
}

/** Whether this web server has a secret to sign with. */
export function sttAuthConfigured(): boolean {
  return key() !== null;
}

/** The header that signs one request to the service, or nothing when there is no secret. */
export function sttServerHeaders(opts?: { secret?: string; now?: number }): Record<string, string> {
  const k = key(opts?.secret ?? process.env.STT_SECRET);
  if (!k) return {};
  const exp = Math.floor((opts?.now ?? Date.now()) / 1000) + SERVER_TTL_S;
  return { [STT_AUTH_HEADER]: `s.${exp}.${sign(`s.${exp}`, k)}` };
}

/**
 * A token for recording into one meeting, for whoever the caller has already found owns it.
 * Null with no secret: the service is not checking, and the client sends nothing.
 */
export function meetingSttToken(
  meetingId: string | null,
  opts?: { secret?: string; now?: number; ttl?: number },
): { token: string; expiresAt: number } | null {
  const k = key(opts?.secret ?? process.env.STT_SECRET);
  if (!k) return null;
  const id = meetingId ?? "-";
  const exp = Math.floor((opts?.now ?? Date.now()) / 1000) + (opts?.ttl ?? MEETING_TTL_S);
  return { token: `m.${id}.${exp}.${sign(`m.${id}.${exp}`, k)}`, expiresAt: exp * 1000 };
}
