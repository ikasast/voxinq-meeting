// Which lines leave when a recording is trimmed, and where the rest end up.
//
// A meeting left recording after it ended has hours of a quiet room at the end, and whatever
// the recogniser made of it scattered through the transcript. Trimming keeps [startMs, endMs)
// of the audio and every line that has any part inside it; the others go.
//
// A line's place in the recording is its own stored offsets, or — for lines saved before those
// were kept — the recording's boundary at the same position, which is the pairing diarization
// relies on. A line whose place cannot be told is kept: deleting something nobody can show was
// outside the range is the one mistake here that cannot be undone.

export type TrimRow = { id: string; audioStartMs: number | null; audioEndMs: number | null };

export type TrimPlan = {
  /** Indices (in recording order) of the lines that leave, for the recording's boundaries. */
  drop: number[];
  dropIds: string[];
  /** Lines that stay but began before the cut: their start moves to zero, not below it. */
  straddling: string[];
};

export function planTrim(
  rows: TrimRow[],
  segments: { start: number; end: number }[] | null,
  startMs: number,
  endMs: number,
): TrimPlan {
  const paired = segments !== null && segments.length === rows.length;
  const plan: TrimPlan = { drop: [], dropIds: [], straddling: [] };
  rows.forEach((row, i) => {
    let from = row.audioStartMs;
    let to = row.audioEndMs;
    if ((from === null || to === null) && paired) {
      from = Math.round(segments[i].start * 1000);
      to = Math.round(segments[i].end * 1000);
    }
    if (from === null || to === null) return;
    if (to <= startMs || from >= endMs) {
      plan.drop.push(i);
      plan.dropIds.push(row.id);
    } else if (row.audioStartMs !== null && row.audioStartMs < startMs) {
      plan.straddling.push(row.id);
    }
  });
  return plan;
}
