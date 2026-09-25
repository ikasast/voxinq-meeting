// Meetings that were recorded and still have no minutes.
//
// Recording and writing the minutes are one action in the interface and two in practice: at a
// conference you record all day and the minutes wait for the evening. The list then carries a
// dozen meetings with "0 sets of minutes" in grey text, which is easy to walk past — and the
// only way to act on them was to open each one.

export type MinutesCandidateRow = {
  id: string;
  title: string;
  startedAt: Date;
  endedAt: Date | null;
  summaryStatus: string | null;
  _count: { transcripts: number; summaries: number };
};

export type MinutesCandidate = { id: string; title: string; startedAt: string };

/**
 * The meetings in a list that minutes could be written for, in the order they are shown.
 *
 * A meeting qualifies when it has finished, has something to write from, and has no minutes
 * yet. One that is already generating or waiting in the queue is not offered: asking twice is
 * how a queue turns into a duplicate. A failed attempt is offered again — that is a retry, and
 * it is the whole reason the state is worth seeing on the card.
 */
export function minutesCandidates(rows: MinutesCandidateRow[]): MinutesCandidate[] {
  return rows
    .filter(
      (m) =>
        m.endedAt !== null &&
        m._count.transcripts > 0 &&
        m._count.summaries === 0 &&
        m.summaryStatus !== "processing",
    )
    .map((m) => ({ id: m.id, title: m.title, startedAt: m.startedAt.toISOString() }));
}

/** Whether a card should say, visibly, that this meeting has no minutes. */
export function needsMinutes(row: MinutesCandidateRow): boolean {
  return (
    row.endedAt !== null &&
    row._count.transcripts > 0 &&
    row._count.summaries === 0 &&
    row.summaryStatus !== "processing"
  );
}
