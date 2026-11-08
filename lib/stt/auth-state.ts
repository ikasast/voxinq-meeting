import { sttAuthConfigured } from "./auth";
import { sttFetch } from "./internal";

/**
 * Whether the transcription service only answers this app (lib/stt/auth.ts), for Administration.
 *
 * - "signed": both have the same secret.
 * - "open": the service has none, so any device that reaches its port can use it, recordings
 *   included. A compose file fetched before 4.9 starts this way, and so does an older service.
 * - "mismatch": the service has a secret and this app does not, or a different one. Recording,
 *   playback and everything else that goes through the service fails.
 * - "unknown": the service did not answer.
 */
export type SttAuthState = "signed" | "open" | "mismatch" | "unknown";

export async function sttAuthState(): Promise<SttAuthState> {
  const res = await sttFetch("/health", { signal: AbortSignal.timeout(4000), cache: "no-store" }).catch(() => null);
  if (!res?.ok) return "unknown";
  const health = (await res.json().catch(() => null)) as { auth?: boolean } | null;
  if (health?.auth !== true) return "open";
  if (!sttAuthConfigured()) return "mismatch";
  // Both have a secret; whether it is the same one, only a signed request can say.
  const probe = await sttFetch("/retention", { signal: AbortSignal.timeout(4000), cache: "no-store" }).catch(() => null);
  if (!probe) return "unknown";
  return probe.status === 401 ? "mismatch" : "signed";
}
