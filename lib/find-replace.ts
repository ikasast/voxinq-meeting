// Find and replace across one meeting's transcript.
//
// The recurring case is a name or term the recogniser got wrong the same way every time —
// "ネクサス" for NEXUS across forty utterances. Fixing those one row at a time is the tedium
// this removes.
//
// Plain text, never a regular expression: the input is a term someone heard in a meeting, and
// characters like `.` or `(` are far more likely to be part of it than to be intended as syntax.
//
// Safe for diarization by construction — speakers map onto utterances by position and rewriting
// text moves nothing. Deleting an utterance is the operation that has to keep the recording in
// step, and replace can never delete one: a replacement that empties a row is refused.

export const TEXT_MAX = 5000;

export type ReplaceOptions = {
  /** Off by default: "nexus" should find "NEXUS", which is usually the point. */
  caseSensitive?: boolean;
};

export type RowInput = { id: string; text: string };

export type RowChange = {
  id: string;
  before: string;
  after: string;
  count: number;
};

export type RowSkip = {
  id: string;
  reason: "empty" | "too-long";
};

export type ReplacePlan = {
  changes: RowChange[];
  skipped: RowSkip[];
  /** Rows that contain the term, whether or not the replacement is usable. */
  matchedRows: number;
  totalMatches: number;
};

/** Count non-overlapping occurrences, scanning forward like a replace would. */
export function countMatches(text: string, find: string, opts: ReplaceOptions = {}): number {
  if (!find) return 0;
  const haystack = opts.caseSensitive ? text : text.toLowerCase();
  const needle = opts.caseSensitive ? find : find.toLowerCase();
  let count = 0;
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(needle, from);
    if (at === -1) return count;
    count += 1;
    from = at + needle.length;
  }
}

/** Replace every occurrence. Case-insensitive matching still writes the replacement verbatim. */
export function replaceAll(
  text: string,
  find: string,
  replace: string,
  opts: ReplaceOptions = {},
): string {
  if (!find) return text;
  const haystack = opts.caseSensitive ? text : text.toLowerCase();
  const needle = opts.caseSensitive ? find : find.toLowerCase();
  let out = "";
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(needle, from);
    if (at === -1) return out + text.slice(from);
    out += text.slice(from, at) + replace;
    from = at + needle.length;
  }
}

/**
 * Work out what a replace would do, without doing it.
 *
 * The UI shows this as a preview and the server recomputes it before writing — the browser's
 * idea of the new text is never trusted, so a stale tab cannot overwrite rows edited since.
 */
export function planReplace(
  rows: RowInput[],
  find: string,
  replace: string,
  opts: ReplaceOptions = {},
): ReplacePlan {
  const changes: RowChange[] = [];
  const skipped: RowSkip[] = [];
  let matchedRows = 0;
  let totalMatches = 0;

  if (!find) return { changes, skipped, matchedRows, totalMatches };

  for (const row of rows) {
    const count = countMatches(row.text, find, opts);
    if (count === 0) continue;
    matchedRows += 1;
    totalMatches += count;

    const after = replaceAll(row.text, find, replace, opts);
    if (after === row.text) continue; // replacing a term with itself
    // Emptying a row is a deletion, and deletions have to remove the matching boundary in the
    // recording or every later line is attributed to the wrong speaker. Out of scope here.
    if (!after.trim()) {
      skipped.push({ id: row.id, reason: "empty" });
      continue;
    }
    if (after.length > TEXT_MAX) {
      skipped.push({ id: row.id, reason: "too-long" });
      continue;
    }
    changes.push({ id: row.id, before: row.text, after, count });
  }

  return { changes, skipped, matchedRows, totalMatches };
}
