import { sttServerHeaders } from "./auth";

// Where the web *server* reaches the STT service, as opposed to lib/stt/client.ts, which is
// the address the *browser* uses.
//
// 127.0.0.1 rather than localhost on purpose. The STT service binds IPv4, but `localhost`
// resolves to ::1 first on Windows — so any other process holding IPv6 :8000 (a container
// publishing the same port, say) silently answers instead, and the request quietly reaches the
// wrong server. Compose sets this to http://stt:8000.
export function sttInternalUrl(): string {
  return process.env.STT_INTERNAL_URL ?? "http://127.0.0.1:8000";
}

/**
 * A request from this server to the STT service, signed (lib/stt/auth.ts).
 *
 * The only way to call it: the service refuses an unsigned request once it has a secret, so a
 * bare `fetch` would work on an instance without one and fail on every other. A test holds
 * every caller to this.
 */
export function sttFetch(path: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  for (const [k, v] of Object.entries(sttServerHeaders())) headers.set(k, v);
  return fetch(`${sttInternalUrl()}${path}`, { ...init, headers });
}
