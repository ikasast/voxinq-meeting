// Where a browser or the Android app reaches the transcription service, when nobody said.
//
// The browser connects to it directly (the web app never relays audio), so it needs an address
// it can reach — and that depends on how the page itself was reached, which the server alone
// cannot know. STT_WS_URL names it outright and still wins. Without it the address follows the
// page, on the layout every setup document describes:
//
//   https://<host>/       → wss://<host>:8443/ws   (tailscale serve, or the tailscale container)
//   http://<host>:<port>/ → ws://<host>:8000/ws    (this machine, or a LAN; STT_PORT moves it)
//
// So a phone opening https://voxinq.example.ts.net/ finds the service beside it with no `.env`
// at all, and the PC opening http://localhost:3000/ still finds ws://localhost:8000.

/** The HTTPS port the setup documents serve the transcription service on. */
export const STT_HTTPS_PORT = 8443;
/** The port the compose file publishes the transcription service on, unless STT_PORT moves it. */
export const STT_DEFAULT_PORT = 8000;

export type PageAddress = { protocol: string; hostname: string };

export function deriveSttWsUrl(page: PageAddress, sttPort: number = STT_DEFAULT_PORT): string {
  const host = page.hostname.includes(":") && !page.hostname.startsWith("[") ? `[${page.hostname}]` : page.hostname;
  return page.protocol === "https:"
    ? `wss://${host}:${STT_HTTPS_PORT}/ws`
    : `ws://${host}:${sttPort}/ws`;
}

/** STT_PORT as the compose file passes it, or the default for anything unusable. */
export function sttPortFrom(value: string | undefined): number {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 && n < 65536 ? n : STT_DEFAULT_PORT;
}

/** The address named in the environment, if any: STT_WS_URL, or the one a source build baked in. */
export function configuredSttWsUrl(): string | null {
  return process.env.STT_WS_URL?.trim() || process.env.NEXT_PUBLIC_STT_WS_URL?.trim() || null;
}

/**
 * The address for a request the server answers on a client's behalf (the Android app's
 * notice-to-record, which has no page to look at). Behind tailscale serve the Host header is the
 * one the client used and X-Forwarded-Proto says https, which is all the derivation needs.
 */
export function sttWsUrlForRequest(h: Headers): string {
  const configured = configuredSttWsUrl();
  if (configured) return configured;
  const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "localhost").split(",")[0].trim();
  const proto = (h.get("x-forwarded-proto") ?? "http").split(",")[0].trim();
  let hostname = "localhost";
  try {
    hostname = new URL(`http://${host}`).hostname;
  } catch {
    // An unparseable Host: fall back to this machine, as before there was any derivation.
  }
  return deriveSttWsUrl({ protocol: `${proto}:`, hostname }, sttPortFrom(process.env.STT_PORT));
}
