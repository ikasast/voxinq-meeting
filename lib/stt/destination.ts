import { externalHostOf } from "../llm/destination";

/**
 * The host speech recognition will be sent to, or null when it stays on this machine.
 *
 * Judged by URL rather than by the fact that a URL is set. A whisper server of your own on the
 * next machine is a case this backend exists to serve as much as any cloud, and warning about
 * it would be wrong -- the same rule the LLM side uses, from the same function.
 *
 * One source, deliberately. `STT_CLOUD_*` in the environment seeds these settings' defaults
 * rather than configuring the STT service separately, so there is nothing else that could be
 * in force and disagree with what this screen shows.
 */
export function sttDestination(settings: {
  sttProvider?: string;
  sttRemoteBaseUrl?: string;
}): string | null {
  if (settings.sttProvider !== "remote") return null;
  return externalHostOf(settings.sttRemoteBaseUrl ?? "");
}
