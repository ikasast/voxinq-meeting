import type { AppSettings } from "./settings";

// Which settings belong to the machine, and which to the person.
//
// The line is drawn by what the setting is *about*. A machine setting describes hardware that
// exists once — the model resident on the one GPU, how much of the card the queue may commit,
// the context window that has to fit beside it. Two people cannot each have their own answer to
// those, because there is only one card and it would be a tug of war rather than a preference.
//
// Everything else is a preference: which model writes your minutes and with whose API key, what
// language they come out in, the words your recogniser should expect, how long before the
// recording screen goes black. Those are yours, and somebody else having a different answer
// costs nothing.
//
// **A user's settings are stored sparsely.** An absent key means "the machine's value, as it is
// now" — so an administrator changing the house default reaches everybody who has not formed an
// opinion, and nobody is frozen at the settings of the day they signed up.

/** Hardware. One machine, one answer, and only an administrator sets it. */
export const MACHINE_KEYS = [
  // The model resident on the STT host. Per-person would mean two recordings fighting over
  // which one is loaded, and whoever pressed record second waiting for a reload.
  "whisperModel",
  // What the queue may commit of the one card.
  "vramBudgetMb",
  // A VRAM figure for the local Ollama, not a model preference.
  "ollamaNumCtx",
] as const satisfies readonly (keyof AppSettings)[];

/**
 * Belongs to both, and cannot be forced into either.
 *
 * An administrator publishes endpoints everybody can use — that is what stops each person
 * needing their own Groq account — and anybody may add their own on top with their own key. So
 * one list on screen is two lists underneath: the shared entries are the machine's and only an
 * administrator edits them, and everything else is the reader's own.
 */
export const SPLIT_KEYS = ["sttProfiles"] as const satisfies readonly (keyof AppSettings)[];

/** Preferences. Each person's own, falling back to the machine's while they have not chosen. */
export const USER_KEYS = [
  "sttLanguage",
  "sttGlossary",
  "micMode",
  "sttTranslate",
  "sttDefaultProfileId",
  "llmProvider",
  "ollamaBaseUrl",
  "ollamaModel",
  "anthropicModel",
  "anthropicApiKey",
  "openaiBaseUrl",
  "openaiModel",
  "openaiApiKey",
  "llmBackground",
  "minutesTemplates",
  "defaultMinutesTemplateId",
  "summaryLanguage",
  "summaryDetail",
  "restScreenSeconds",
  // Voiceprints are per person, so the confidence needed to match one is too.
  "voiceprintThreshold",
] as const satisfies readonly (keyof AppSettings)[];

export type MachineKey = (typeof MACHINE_KEYS)[number];
export type UserKey = (typeof USER_KEYS)[number];

const MACHINE = new Set<string>(MACHINE_KEYS);
const USER = new Set<string>(USER_KEYS);
const SPLIT = new Set<string>(SPLIT_KEYS);

export function isSplitKey(k: string): boolean {
  return SPLIT.has(k);
}

export function isMachineKey(k: string): k is MachineKey {
  return MACHINE.has(k);
}

export function isUserKey(k: string): k is UserKey {
  return USER.has(k);
}

/**
 * Keep only the keys a person is allowed to set.
 *
 * Anything else in a stored override is dropped rather than trusted: a machine key that found
 * its way into somebody's settings — from an older release, or by hand — would otherwise let
 * one account quietly choose the Whisper model for the whole machine.
 */
export function onlyUserKeys(patch: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) if (USER.has(k) || SPLIT.has(k)) out[k] = v;
  return out;
}
