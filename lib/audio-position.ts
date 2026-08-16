// Where an utterance sits in the recording, for the click-to-seek player.
//
// Three sources, best first. The last one is what the app used to do for everything, and it is
// wrong by construction: a row's `createdAt` is stamped when transcription finished and the row
// reached the database, so it trails the speech by the utterance's own length plus however long
// recognition took. Measured on two real meetings, that put clicks up to 9.8 s before the words —
// and looked exact on whichever rows happened to be the same length as the first one.

export type PositionRow = {
  createdAt: string;
  audioStartMs?: number | null;
};

export type Segment = { start: number; end: number };

export type PositionSources = {
  /** Utterance boundaries from the recording, in order. */
  segments?: Segment[] | null;
  /** Start of the first utterance in the WAV, for the legacy estimate. */
  firstUtteranceStart?: number | null;
};

/**
 * Seconds into the recording for row `index`, or null when nothing can place it (no rows, or a
 * meeting with no recording at all).
 */
export function audioPosition(
  rows: PositionRow[],
  index: number,
  sources: PositionSources,
): number | null {
  const row = rows[index];
  if (!row) return null;

  // 1. Stored with the utterance when it was recognised — exact.
  if (typeof row.audioStartMs === "number" && Number.isFinite(row.audioStartMs)) {
    return Math.max(0, row.audioStartMs / 1000);
  }

  // 2. Positional lookup in the recording's boundaries, for rows saved before the offsets were
  //    kept. Only when the counts still agree: an utterance deleted without its boundary (the
  //    sync can refuse) would shift every later row onto the wrong audio, which is worse than
  //    the estimate below.
  const segments = sources.segments;
  if (segments && segments.length === rows.length) {
    const seg = segments[index];
    if (seg && Number.isFinite(seg.start)) return Math.max(0, seg.start);
  }

  // 3. Legacy estimate: first utterance's position plus wall-clock elapsed since the first row.
  const anchor = Date.parse(rows[0].createdAt);
  const at = Date.parse(row.createdAt);
  if (!Number.isFinite(anchor) || !Number.isFinite(at)) return null;
  return Math.max(0, (sources.firstUtteranceStart ?? 0) + (at - anchor) / 1000);
}

/** Position relative to the first utterance — what the row's timestamp label shows. */
export function displayOffset(
  rows: PositionRow[],
  index: number,
  sources: PositionSources,
): number | null {
  const here = audioPosition(rows, index, sources);
  const first = audioPosition(rows, 0, sources);
  if (here === null || first === null) return null;
  return Math.max(0, here - first);
}
