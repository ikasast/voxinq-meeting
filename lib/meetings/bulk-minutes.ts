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

const DETAILS = new Set(["brief", "standard", "detailed"]);
const PROVIDERS = new Set(["ollama", "anthropic", "openai"]);

/**
 * The per-batch overrides that are recognisable, and nothing else.
 *
 * Each one goes into every job's params and from there into the queue's pricing — a provider
 * decides whether the job waits for the card — so one nobody offers is dropped here rather than
 * stored two hundred times. A template id is taken as given: one that no longer exists falls
 * back to the settings when the job runs, as it does for a single meeting.
 */
export function minutesOverrides(body: Record<string, unknown> | null): {
  detail?: string;
  provider?: string;
  templateId?: string;
} {
  const out: { detail?: string; provider?: string; templateId?: string } = {};
  if (typeof body?.detail === "string" && DETAILS.has(body.detail)) out.detail = body.detail;
  if (typeof body?.provider === "string" && PROVIDERS.has(body.provider)) out.provider = body.provider;
  if (
    typeof body?.templateId === "string" &&
    body.templateId.length > 0 &&
    body.templateId.length <= 100
  ) {
    out.templateId = body.templateId;
  }
  return out;
}
