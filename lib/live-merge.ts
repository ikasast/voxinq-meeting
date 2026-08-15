// Reconciling a poll of the server's transcripts with what a viewer already has on screen.
//
// While a meeting is being recorded on one device, other devices watching the meeting page
// poll for new utterances. A poll response is a snapshot that can be several seconds stale, so
// it cannot simply replace local state: the viewer may have corrected a line in the meantime,
// and a stale response would silently undo that edit.
//
// The rule is three-way, like a merge: a field is taken from the server only when the local
// value still matches what the server said *last* time. If the two have diverged, the local
// value is an edit this client made and it wins until the server catches up with it.

export type LiveItem = {
  id: string;
  speakerType: string;
  text: string;
  createdAt: string;
  translation?: string | null;
};

/** What the server said last poll, per utterance id — the base of the three-way merge. */
export type ServerSnapshot = Map<string, { text: string; speakerType: string; translation: string | null }>;

export type MergeResult = { next: LiveItem[]; snapshot: ServerSnapshot };

function snapshotOf(items: LiveItem[]): ServerSnapshot {
  return new Map(
    items.map((t) => [t.id, { text: t.text, speakerType: t.speakerType, translation: t.translation ?? null }]),
  );
}

/**
 * Merge a freshly polled list into the list currently rendered.
 *
 * - New rows are added (the common case: the recorder just saved another utterance).
 * - Existing rows adopt server text/speaker/translation only where the local value still
 *   equals the previous server value. Translations arrive as a later PATCH to an old row, so
 *   this is what makes them show up without clobbering edits.
 * - Rows the server no longer has are dropped, unless this client edited them — that means a
 *   delete raced an edit, and keeping the row is the recoverable direction.
 *
 * `prev` empty (first poll) means there is no base to compare against, so local values are
 * kept and only additions apply.
 */
export function mergeLiveTranscripts(
  local: LiveItem[],
  prev: ServerSnapshot,
  incoming: LiveItem[],
): MergeResult {
  const localById = new Map(local.map((t) => [t.id, t]));
  const merged: LiveItem[] = [];

  for (const remote of incoming) {
    const mine = localById.get(remote.id);
    if (!mine) {
      merged.push(remote);
      continue;
    }
    const base = prev.get(remote.id);
    if (!base) {
      // No base to judge against — keep what is on screen rather than risk reverting an edit.
      merged.push(mine);
      continue;
    }
    merged.push({
      ...mine,
      text: mine.text === base.text ? remote.text : mine.text,
      speakerType: mine.speakerType === base.speakerType ? remote.speakerType : mine.speakerType,
      translation:
        (mine.translation ?? null) === base.translation ? (remote.translation ?? null) : mine.translation,
    });
  }

  // Locally-edited rows the server has dropped: keep them so an edit is never lost to a race.
  const incomingIds = new Set(incoming.map((t) => t.id));
  for (const mine of local) {
    if (incomingIds.has(mine.id)) continue;
    const base = prev.get(mine.id);
    const edited = base ? mine.text !== base.text || mine.speakerType !== base.speakerType : false;
    if (edited) merged.push(mine);
  }

  // createdAt is the transcript's running order, and diarization maps speakers onto utterances
  // by position — so ordering has to be deterministic. id breaks ties within the same ms.
  merged.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));

  return { next: merged, snapshot: snapshotOf(incoming) };
}
