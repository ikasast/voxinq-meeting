// Voice cues (an extension): how a line was said, against how the same person said the rest of
// the meeting.
//
// The service measures each line's loudness, pitch and voiced time (stt-service/voice.py). Taken
// alone those say more about the microphone than the person — a seat further from it, a phone in
// a room, a remote participant through a speaker. So each is compared with the same speaker's own
// lines in the same meeting, and only a line that stands out is marked: louder or quieter, higher
// or lower, faster or slower than that person usually was.
//
// Pure, so it can be tested and shared by the route that stores it and the page that shows it.

/** What the service answered for one line, or null where it could not measure. */
export type Measured = { rmsDb: number; f0: number | null; voicedS: number } | null;

export type CueLine = { id: string; speaker: string; text: string; measured: Measured };

/** Standard deviations from the speaker's own average. A cue that could not be judged is absent. */
export type Cues = { loud?: number; pitch?: number; pace?: number };

/** Fewer lines than this and a speaker has no "usual" to stand out from. */
export const MIN_LINES = 4;
/**
 * How far from usual before a line is marked. One deviation marked a third of every line, which
 * is the ordinary wobble of speech, not a line that stood out; one and a half marks about one in
 * eight, and measured on a test meeting it kept the lines said loudly and fast and dropped the rest.
 */
export const STANDS_OUT = 1.5;

// Floors under the spread, so a speaker who happened to say everything the same way does not
// have a hair's difference called "louder".
const MIN_SD_DB = 3;
const MIN_SD_SEMITONES = 1.5;
const MIN_SD_PACE_SHARE = 0.15;
/** Too little voice to say how fast it was. */
const MIN_VOICED_S = 0.8;

/** Characters that are spoken, roughly: letters and kana, not spaces or punctuation. */
export function spokenLength(text: string): number {
  return (text.match(/[\p{L}\p{N}]/gu) ?? []).length;
}

function zScores(values: (number | null)[], minSd: (mean: number) => number): (number | null)[] {
  const have = values.filter((v): v is number => v !== null);
  if (have.length < MIN_LINES) return values.map(() => null);
  const mean = have.reduce((a, b) => a + b, 0) / have.length;
  const sd = Math.sqrt(have.reduce((a, b) => a + (b - mean) ** 2, 0) / have.length);
  const spread = Math.max(sd, minSd(mean));
  return values.map((v) => (v === null ? null : Math.round(((v - mean) / spread) * 100) / 100));
}

/** Each line's cues, by id. Lines with nothing measured get none. */
export function relativeCues(lines: CueLine[]): Map<string, Cues> {
  const out = new Map<string, Cues>();
  const bySpeaker = new Map<string, CueLine[]>();
  for (const l of lines) {
    if (!l.measured) continue;
    const list = bySpeaker.get(l.speaker) ?? [];
    list.push(l);
    bySpeaker.set(l.speaker, list);
  }
  for (const group of bySpeaker.values()) {
    const loud = zScores(
      group.map((l) => (l.measured!.voicedS > 0 ? l.measured!.rmsDb : null)),
      () => MIN_SD_DB,
    );
    // Pitch on a musical scale: a step up from 100 Hz and from 200 Hz sound the same size.
    const pitch = zScores(
      group.map((l) => (l.measured!.f0 ? 12 * Math.log2(l.measured!.f0) : null)),
      () => MIN_SD_SEMITONES,
    );
    const pace = zScores(
      group.map((l) =>
        l.measured!.voicedS >= MIN_VOICED_S ? spokenLength(l.text) / l.measured!.voicedS : null,
      ),
      (mean) => mean * MIN_SD_PACE_SHARE,
    );
    group.forEach((l, i) => {
      const c: Cues = {};
      if (loud[i] !== null) c.loud = loud[i]!;
      if (pitch[i] !== null) c.pitch = pitch[i]!;
      if (pace[i] !== null) c.pace = pace[i]!;
      out.set(l.id, c);
    });
  }
  return out;
}

/** The stored JSON, read back; anything unreadable is no cues. */
export function readCues(raw: string | null | undefined): Cues | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Record<string, unknown>;
    const c: Cues = {};
    for (const k of ["loud", "pitch", "pace"] as const) if (typeof v[k] === "number") c[k] = v[k] as number;
    return c;
  } catch {
    return null;
  }
}

export type CueMark = { cue: "loud" | "pitch" | "pace"; up: boolean };

/** The cues worth showing on a line: only those that stand out. */
export function marks(c: Cues | null): CueMark[] {
  if (!c) return [];
  return (["loud", "pitch", "pace"] as const)
    .filter((k) => typeof c[k] === "number" && Math.abs(c[k]!) >= STANDS_OUT)
    .map((k) => ({ cue: k, up: c[k]! > 0 }));
}
