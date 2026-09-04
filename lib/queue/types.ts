// What the queue can be asked to run, and what each run costs.
//
// The costs are a GPU budget, not a promise about RAM: a job whose work happens on someone
// else's machine — recognition sent to an endpoint, minutes written by a cloud model — costs
// nothing here however long it takes, because what is being rationed is the card.

/** Every kind the dispatcher knows how to run. Anything else in the table is ignored. */
export const JOB_KINDS = ["minutes", "transcribe", "diarize"] as const;
export type JobKind = (typeof JOB_KINDS)[number];

export const JOB_STATUSES = ["queued", "running", "done", "error", "cancelled"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

/** Still-to-happen work: what a queue view lists, and what capacity is measured against. */
export const OPEN_STATUSES: JobStatus[] = ["queued", "running"];

export type MinutesParams = {
  /** "brief" | "standard" | "detailed" — absent uses the saved setting. */
  detail?: string;
  /** "ollama" | "anthropic" | "openai" — absent uses the saved setting. */
  provider?: string;
  /** A saved template id, or "default" for the built-in format. */
  templateId?: string;
};

/** What each kind is called on screen. */
export const JOB_LABEL: Record<JobKind, string> = {
  minutes: "Minutes",
  transcribe: "Re-transcribe",
  diarize: "Diarize",
};

export function isJobKind(v: unknown): v is JobKind {
  return typeof v === "string" && (JOB_KINDS as readonly string[]).includes(v);
}

/**
 * Read a job's params back.
 *
 * Stored as text rather than JSONB so the column is the same shape everywhere and a malformed
 * row cannot fail a query. A job that cannot be parsed runs with its defaults, which for
 * minutes means the saved settings — the same thing that happens when no overrides were given.
 */
export function parseParams<T extends object>(raw: string): Partial<T> {
  try {
    const v = JSON.parse(raw) as unknown;
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Partial<T>) : {};
  } catch {
    return {};
  }
}
