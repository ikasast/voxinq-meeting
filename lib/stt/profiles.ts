// Recognition endpoints you have saved, and how the app talks about them.
//
// One endpoint was enough while there was one to have. It stopped being enough the moment
// choosing a remote one meant you could no longer re-transcribe locally: the setting was
// answering "where does recognition happen" once, for everything, when the honest answer is
// "wherever you pick, this time".
//
// So a profile is a saved destination with a name, and the model picker offers them beside the
// local models. The setting that remains is which one is the default.

/** How to talk to an endpoint. The wire format differs, not just the address. */
export type SttProfileKind = "openai" | "gemini";

export type SttProfile = {
  /** Stable across renames, because it is what a saved choice refers to. */
  id: string;
  /** What you call it. Shown in the picker: "Groq", "the box in the study". */
  name: string;
  kind: SttProfileKind;
  /**
   * For `openai`, the `/v1` root that `/audio/transcriptions` hangs off. For `gemini`, the
   * API root; blank uses Google's own, since there is nowhere else to point it.
   */
  baseUrl: string;
  model: string;
  apiKey: string;
};

/** A profile with the key removed, which is all the browser is ever given. */
export type PublicSttProfile = Omit<SttProfile, "apiKey"> & { hasApiKey: boolean };

export const GEMINI_DEFAULT_BASE = "https://generativelanguage.googleapis.com/v1beta";

/** Defaults worth offering, because typing an endpoint from memory is how a typo gets saved. */
export const PROFILE_PRESETS: { label: string; kind: SttProfileKind; baseUrl: string; model: string }[] = [
  { label: "Groq", kind: "openai", baseUrl: "https://api.groq.com/openai/v1", model: "whisper-large-v3-turbo" },
  { label: "OpenAI", kind: "openai", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-transcribe" },
  { label: "Gemini", kind: "gemini", baseUrl: GEMINI_DEFAULT_BASE, model: "gemini-3.5-transcribe" },
  { label: "My own server", kind: "openai", baseUrl: "http://127.0.0.1:8080/v1", model: "whisper-1" },
];

export function publicProfile(p: SttProfile): PublicSttProfile {
  const { apiKey, ...rest } = p;
  return { ...rest, hasApiKey: Boolean(apiKey) };
}

/**
 * Read profiles out of whatever is in settings.json, including what was there before profiles
 * existed.
 *
 * The single-endpoint fields are migrated rather than dropped: an install that had one
 * configured, and is working, must not quietly lose it on upgrade. It becomes one profile
 * named after its host, and the default if it was in use.
 */
export function normalizeProfiles(raw: unknown): SttProfile[] {
  if (!Array.isArray(raw)) return [];
  const out: SttProfile[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const p = item as Record<string, unknown>;
    const id = typeof p.id === "string" && p.id.trim() ? p.id.trim() : "";
    const name = typeof p.name === "string" ? p.name.trim() : "";
    if (!id || !name) continue;
    const kind: SttProfileKind = p.kind === "gemini" ? "gemini" : "openai";
    out.push({
      id,
      name: name.slice(0, 60),
      kind,
      baseUrl: typeof p.baseUrl === "string" ? p.baseUrl.trim() : "",
      model: typeof p.model === "string" ? p.model.trim() : "",
      apiKey: typeof p.apiKey === "string" ? p.apiKey : "",
    });
  }
  return out;
}

/** A name for a migrated endpoint: its host, which is what someone would call it anyway. */
export function nameFromBaseUrl(baseUrl: string): string {
  const raw = baseUrl.trim();
  if (!raw) return "Saved endpoint";
  try {
    return new URL(raw).hostname || raw;
  } catch {
    return raw.slice(0, 60);
  }
}

/** Ids are only compared, never parsed, so anything unique will do. */
export function newProfileId(): string {
  return "p" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}
