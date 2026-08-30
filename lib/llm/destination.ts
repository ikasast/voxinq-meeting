// Where a provider's requests actually go.
//
// Not derivable from the provider's name, which is the trap this exists to avoid.
// "OpenAI-compatible" is the setting vLLM and LM Studio use, and those run on this machine;
// Ollama's base URL can equally be pointed at another host. Judging by name would warn about
// a local model and stay silent about a remote one -- exactly backwards.
//
// So the question asked is the only one that matters: does the request leave this machine.

/** Hosts that are this machine, or a network the user already controls. */
function isLocalHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h === "::1" || h.endsWith(".localhost")) return true;
  // Anything in 127/8, not just 127.0.0.1 -- and 0.0.0.0, which resolves to this machine.
  if (/^127\./.test(h) || h === "0.0.0.0") return true;
  // Private ranges: another box on the same LAN is not "sending your meetings to a company".
  if (/^10\./.test(h) || /^192\.168\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  // Docker's name for the host, and mDNS names, which cannot leave the local network.
  if (h === "host.docker.internal" || h.endsWith(".local")) return true;
  // A single-label name -- no dot anywhere -- cannot be resolved on the public internet. It is
  // a container on a compose network, a LAN hostname or an /etc/hosts entry. This matters:
  // the Docker deployment's own setting is `http://ollama:11434`, and without this rule the
  // default local install would be warned about as if it were sending meetings to a company.
  if (!h.includes(".")) return true;
  return false;
}

/**
 * The organisation a base URL sends to, or null when it does not leave the machine or LAN.
 * An unparseable URL is treated as external: a warning that turns out to be unnecessary is
 * better than silence about a destination we could not read.
 */
export function externalHostOf(baseUrl: string): string | null {
  const raw = (baseUrl || "").trim();
  if (!raw) return null; // nothing configured yet; the fieldset below says what to fill in
  let host: string;
  try {
    host = new URL(raw.includes("://") ? raw : `http://${raw}`).hostname;
  } catch {
    return raw;
  }
  return isLocalHost(host) ? null : host;
}

export type ProviderDestination = { external: false } | { external: true; host: string };

/**
 * Where minutes generation will send the transcript, for the current settings.
 * Anthropic has no configurable base URL, so it is always api.anthropic.com.
 */
export function llmDestination(settings: {
  llmProvider: string;
  ollamaBaseUrl?: string;
  openaiBaseUrl?: string;
}): ProviderDestination {
  if (settings.llmProvider === "anthropic") {
    return { external: true, host: "api.anthropic.com" };
  }
  const base = settings.llmProvider === "ollama" ? settings.ollamaBaseUrl : settings.openaiBaseUrl;
  const host = externalHostOf(base ?? "");
  return host ? { external: true, host } : { external: false };
}
