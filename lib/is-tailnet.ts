import { headers } from "next/headers";

// Decide whether a request comes "from the outside (an untrusted path)".
// When judged external, the recording UI is disabled (STT is assumed unreachable).
//
// NETWORK_MODE switches the trust model (default "tailscale"):
//   - "tailscale": treated as internal if the identity header added by Tailscale serve
//     (Tailscale-User-Login) is present, otherwise external (Funnel/public path).
//     * If you put your own public proxy in front, always strip that header (anti-spoofing).
//   - "lan": assumes same-network operation, so any reachable access is treated as
//     internal (recording allowed). Auth is controlled only by whether APP_PASSWORD is set.
//
// When APP_PASSWORD is unset (auth disabled), everything is treated as internal as before.
export async function isExternalRequest(): Promise<boolean> {
  if (process.env.NETWORK_MODE === "lan") return false;
  if (!process.env.APP_PASSWORD) return false;
  const h = await headers();
  return !h.get("tailscale-user-login");
}
