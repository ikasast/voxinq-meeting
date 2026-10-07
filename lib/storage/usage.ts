// How much room a person's meetings take, and in what. The arithmetic for app/storage.
//
// Not a quota: nothing here is measured against a limit. And not one bar for everything: an
// hour of audio is about 110 MB and an hour of its transcript a tenth of one, so a bar holding
// both says only "it is the audio". The page shows the two apart — the recordings by what will
// happen to them, which is the part anyone can act on, and the text on a scale of its own.

export type RecordingSize = {
  /** The WAV, in bytes. */
  audio: number;
  /** The files kept beside it (utterance boundaries, speaker separation results), in bytes. */
  other: number;
  seconds: number | null;
  protected: boolean;
  /** When the retention sweep will take it; null when it will not (protected, or retention off). */
  expiresAt: string | null;
};

/**
 * What becomes of a recording's room. In the trash first: emptying the trash deletes the
 * recording whether or not it was protected.
 */
export type Fate = "trash" | "protected" | "expiring" | "kept";

export function fateOf(r: Pick<RecordingSize, "protected" | "expiresAt">, inTrash: boolean): Fate {
  if (inTrash) return "trash";
  if (r.protected) return "protected";
  return r.expiresAt ? "expiring" : "kept";
}

/** Whole days from `now` until `when`, at least one: "within 3 days". */
export function daysUntil(when: Date, now: Date): number {
  return Math.max(1, Math.ceil((when.getTime() - now.getTime()) / 86_400_000));
}

const MB = 1024 * 1024;

/**
 * Always in MB, so any two sizes on the page can be compared by reading them:
 * "1,247 MB", "3.8 MB", "0.21 MB", and "< 0.01 MB" for what would otherwise round to nothing.
 * Binary megabytes, as the file manager counts them.
 */
export function formatMB(bytes: number): string {
  if (bytes <= 0) return "0 MB";
  const mb = bytes / MB;
  if (mb < 0.01) return "< 0.01 MB";
  const digits = mb < 1 ? 2 : mb < 10 ? 1 : 0;
  return `${mb.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })} MB`;
}

/**
 * Each part's width on a bar, in percent, summing to 100.
 *
 * In proportion, except that a part that is there at all is never thinner than `min`: a part
 * that cannot be seen reads as a part that is not there.
 */
export function barWidths(sizes: number[], min = 0.8): number[] {
  const total = sizes.reduce((a, b) => a + b, 0);
  if (total <= 0) return sizes.map(() => 0);
  const raised = sizes.map((s) => (s > 0 ? Math.max((s / total) * 100, min) : 0));
  const sum = raised.reduce((a, b) => a + b, 0);
  return raised.map((w) => (w * 100) / sum);
}
