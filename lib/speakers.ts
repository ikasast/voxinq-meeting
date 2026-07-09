// Shared utilities for the speaker-key scheme and display (also imported by the client).
//
// Key scheme:
//   "self"      ... the default speaker for mic input
//   "partner-N" ... the N-th speaker assigned by diarization (pyannote)
//
// The STT/diarization side returns labels like "speaker0", "speaker1", ...,
// so normalize them to "partner-N" via diarizerLabelToKey() before saving.

export const SELF_KEY = "self";
const PARTNER_PREFIX = "partner-";

export type SpeakerLabels = Record<string, string>;

/** "partner-3" -> 3. null if not a partner key. */
export function partnerIndex(key: string): number | null {
  if (!key.startsWith(PARTNER_PREFIX)) return null;
  const rest = key.slice(PARTNER_PREFIX.length);
  return /^\d+$/.test(rest) ? Number(rest) : null;
}

/** Whether the speaker key is allowed for DB storage / API acceptance. */
export function isValidSpeakerKey(key: string): boolean {
  return key === SELF_KEY || partnerIndex(key) !== null;
}

/** Diarizer label ("speaker2" etc.) -> speaker key ("partner-2"). Unknown values -> partner-0. */
export function diarizerLabelToKey(label: string | undefined | null): string {
  const m = label?.match(/^speaker(\d+)$/);
  return m ? PARTNER_PREFIX + m[1] : PARTNER_PREFIX + "0";
}

/** Default display name when no custom name is set. partner is "話者N" starting from 1. */
export function defaultSpeakerName(key: string): string {
  if (key === SELF_KEY) return "Me";
  const idx = partnerIndex(key);
  return idx === null ? key : `Speaker ${idx + 1}`;
}

/** Return the custom name if set, otherwise the default name. */
export function speakerName(key: string, labels: SpeakerLabels): string {
  const custom = labels[key]?.trim();
  return custom || defaultSpeakerName(key);
}

/** Safely convert Meeting.speakerLabels (JSON string) into SpeakerLabels. */
export function parseSpeakerLabels(json: string | null | undefined): SpeakerLabels {
  if (!json) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  const labels: SpeakerLabels = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value === "string") labels[key] = value;
  }
  return labels;
}

// Speaker badge colors. self is fixed to a blue tint; partners cycle by index.
type SpeakerTint = { badge: string; dot: string };

const TINTS: { self: SpeakerTint; partners: SpeakerTint[]; unknown: SpeakerTint } = {
  self: { badge: "bg-sky-100 text-sky-700", dot: "bg-sky-500" },
  partners: [
    { badge: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-500" },
    { badge: "bg-amber-100 text-amber-700", dot: "bg-amber-500" },
    { badge: "bg-violet-100 text-violet-700", dot: "bg-violet-500" },
    { badge: "bg-rose-100 text-rose-700", dot: "bg-rose-500" },
    { badge: "bg-cyan-100 text-cyan-700", dot: "bg-cyan-500" },
    { badge: "bg-fuchsia-100 text-fuchsia-700", dot: "bg-fuchsia-500" },
  ],
  unknown: { badge: "bg-zinc-100 text-zinc-600", dot: "bg-zinc-400" },
};

export function speakerColor(key: string): SpeakerTint {
  if (key === SELF_KEY) return TINTS.self;
  const idx = partnerIndex(key);
  return idx === null ? TINTS.unknown : TINTS.partners[idx % TINTS.partners.length];
}

/**
 * List of known speaker keys in display order (self -> partner-0, 1, 2 ...).
 * Merges keys appearing in the transcript with keys that have names.
 */
export function collectSpeakerKeys(
  speakerKeys: Iterable<string>,
  labels?: SpeakerLabels,
): string[] {
  const known = new Set<string>([SELF_KEY]);
  for (const key of speakerKeys) {
    if (isValidSpeakerKey(key)) known.add(key);
  }
  for (const key of Object.keys(labels ?? {})) {
    if (isValidSpeakerKey(key)) known.add(key);
  }
  const order = (key: string) => (key === SELF_KEY ? -1 : (partnerIndex(key) ?? 0));
  return [...known].sort((a, b) => order(a) - order(b));
}

/** Issue the next unused partner key (max index + 1). */
export function nextPartnerKey(speakerKeys: Iterable<string>): string {
  let max = -1;
  for (const key of speakerKeys) {
    const idx = partnerIndex(key);
    if (idx !== null && idx > max) max = idx;
  }
  return PARTNER_PREFIX + (max + 1);
}
