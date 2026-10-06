// How much room a person's meetings take, and in what. The arithmetic for app/storage.
//
// Not a quota: nothing here is measured against a limit. The question it answers is "what is
// using the space", and the answer is nearly always the audio — a minute of it is about 1.9 MB,
// a minute of its transcript a few kilobytes — so the parts are shown side by side rather than
// as a fraction of something.

export type RecordingSize = {
  /** The WAV, in bytes. */
  audio: number;
  /** The files kept beside it (utterance boundaries, speaker separation results), in bytes. */
  other: number;
  seconds: number | null;
  protected: boolean;
};

const KB = 1024;
const MB = KB * 1024;
const GB = MB * 1024;

/** "814 MB", "4.2 MB", "1.3 GB", "36 KB". Binary units, as the file manager counts them. */
export function formatBytes(bytes: number): string {
  if (bytes >= GB) return `${(bytes / GB).toFixed(bytes >= 100 * GB ? 0 : 1)} GB`;
  if (bytes >= MB) return `${(bytes / MB).toFixed(bytes >= 10 * MB ? 0 : 1)} MB`;
  if (bytes >= KB) return `${Math.round(bytes / KB)} KB`;
  return bytes > 0 ? "1 KB" : "0 MB";
}

/**
 * Each part's width on the bar, in percent, summing to 100.
 *
 * In proportion, except that a part that is there at all is never thinner than `min`: beside
 * hours of audio the text is a fraction of a percent, and a part that cannot be seen reads as
 * a part that is not there.
 */
export function barWidths(sizes: number[], min = 0.8): number[] {
  const total = sizes.reduce((a, b) => a + b, 0);
  if (total <= 0) return sizes.map(() => 0);
  const raised = sizes.map((s) => (s > 0 ? Math.max((s / total) * 100, min) : 0));
  const sum = raised.reduce((a, b) => a + b, 0);
  return raised.map((w) => (w * 100) / sum);
}
