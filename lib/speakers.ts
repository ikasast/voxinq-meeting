// Who said a line.
//
// Every transcript row carries a speaker key, and exports, the queue and the Android app all see
// the same keys, so their spelling is data and stays as it is: "self" is whoever held the
// microphone, "partner-<n>" is the n-th voice speaker separation told apart, counted from 0.
// This module is the one place that reads that spelling; the rest of the app asks it.
//
// The diarizer numbers its voices "speaker0", "speaker1", ...; fromDiarizer turns those into keys
// on the way in. The names people give speakers are stored per meeting as a key → name map.
// Used on the server and in the browser alike.

/** The names given to a meeting's speakers, by key. */
export type SpeakerNames = Record<string, string>;

/** The person at the microphone. */
export const MIC_SPEAKER = "self";

const VOICE_KEY = /^partner-(\d+)$/;

/** The key for the n-th separated voice. */
export function voiceKey(n: number): string {
  return `partner-${n}`;
}

/** Which separated voice a key is ("partner-2" → 2), or null when it is not one. */
export function voiceNumber(key: string): number | null {
  const found = VOICE_KEY.exec(key);
  return found ? Number(found[1]) : null;
}

/** Whether a key is one a line may be stored under. */
export function isSpeakerKey(key: string): boolean {
  return key === MIC_SPEAKER || voiceNumber(key) !== null;
}

/**
 * A diarizer label as a key. Labels it did not number are not a voice of their own: they go to
 * `otherwise`, which is the first voice unless the caller says something else.
 */
export function fromDiarizer(label: string | null | undefined, otherwise = voiceKey(0)): string {
  const numbered = /^speaker(\d+)$/.exec(label ?? "");
  return numbered ? voiceKey(Number(numbered[1])) : otherwise;
}

/** What a speaker is called before anyone names them: "Me", or "Speaker 1", "Speaker 2", ... */
export function plainName(key: string): string {
  if (key === MIC_SPEAKER) return "Me";
  const n = voiceNumber(key);
  return n === null ? key : `Speaker ${n + 1}`;
}

/** What a speaker is called: the name someone gave them, else their plain name. */
export function nameOf(key: string, names: SpeakerNames = {}): string {
  return names[key]?.trim() || plainName(key);
}

/** A meeting's stored names. Anything unreadable reads as no names at all. */
export function readNames(stored: string | null | undefined): SpeakerNames {
  let value: unknown = null;
  try {
    value = stored ? JSON.parse(stored) : null;
  } catch {
    return {};
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const names: SpeakerNames = {};
  for (const [key, name] of Object.entries(value)) if (typeof name === "string") names[key] = name;
  return names;
}

/**
 * The names a request asks to store: real keys only, trimmed, none left empty. Null when what was
 * sent is not a map of names at all, which the caller refuses.
 */
export function namesFromRequest(sent: unknown): SpeakerNames | null {
  if (!sent || typeof sent !== "object" || Array.isArray(sent)) return null;
  const names: SpeakerNames = {};
  for (const [key, name] of Object.entries(sent)) {
    const trimmed = typeof name === "string" ? name.trim() : "";
    if (trimmed && isSpeakerKey(key)) names[key] = trimmed;
  }
  return names;
}

/**
 * The speakers to offer, in the order they are shown: the microphone first, always, then every
 * voice that has a line or a name, by number.
 */
export function speakersInOrder(keys: Iterable<string>, names: SpeakerNames = {}): string[] {
  const voices = new Map<string, number>();
  for (const key of [...keys, ...Object.keys(names)]) {
    const n = voiceNumber(key);
    if (n !== null) voices.set(key, n);
  }
  const byNumber = [...voices].sort(([, a], [, b]) => a - b).map(([key]) => key);
  return [MIC_SPEAKER, ...byNumber];
}

/** A voice no line uses yet: one past the highest number among `keys`. */
export function freshVoice(keys: Iterable<string>): string {
  let next = 0;
  for (const key of keys) {
    const n = voiceNumber(key);
    if (n !== null && n >= next) next = n + 1;
  }
  return voiceKey(next);
}

// The colour a speaker is shown in: `chip` for their name tag, `mark` for the dot beside the
// name field. The microphone has its own; voices take the next colour round the ring. Written
// out whole because Tailwind only generates classes it can find spelled out in the source.
type Tone = { chip: string; mark: string };

const MIC_TONE: Tone = { chip: "bg-blue-100 text-blue-800", mark: "bg-blue-600" };
const VOICE_TONES: Tone[] = [
  { chip: "bg-teal-100 text-teal-800", mark: "bg-teal-600" },
  { chip: "bg-orange-100 text-orange-800", mark: "bg-orange-600" },
  { chip: "bg-purple-100 text-purple-800", mark: "bg-purple-600" },
  { chip: "bg-pink-100 text-pink-800", mark: "bg-pink-600" },
  { chip: "bg-lime-100 text-lime-800", mark: "bg-lime-600" },
  { chip: "bg-indigo-100 text-indigo-800", mark: "bg-indigo-600" },
];
const OTHER_TONE: Tone = { chip: "bg-stone-100 text-stone-700", mark: "bg-stone-400" };

export function toneOf(key: string): Tone {
  if (key === MIC_SPEAKER) return MIC_TONE;
  const n = voiceNumber(key);
  return n === null ? OTHER_TONE : VOICE_TONES[n % VOICE_TONES.length];
}
