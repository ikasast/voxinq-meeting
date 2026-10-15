// Emotion (an extension): reading back what stt-service/emotion.py judged for a line.
//
// The model was trained on read emotional speech, not meetings, and four classes are a coarse
// net. So a line is labelled only when one of joy, anger or sadness is clearly ahead — the
// "neutral" class and every close call show nothing — and the page says it is how the line
// sounded, not what anybody felt.

export const EMOTIONS = ["neutral", "joy", "anger", "sadness"] as const;
export type Emotion = (typeof EMOTIONS)[number];

/**
 * How sure before a line is labelled, unless the reader has chosen (Settings → Speakers). At an
 * even chance most lines of a real meeting came out joyful, angry or sad, and the marks stopped
 * meaning anything; four in five is where they start to stand out.
 */
export const CLEAR = 0.8;

/** The thresholds offered on the settings screen. */
export const CLEAR_CHOICES = [0.5, 0.6, 0.7, 0.8, 0.9] as const;

/** The stored probabilities, read back; anything unreadable is nothing. */
export function readEmotion(raw: string | null | undefined): number[] | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as { probs?: unknown };
    return Array.isArray(v.probs) && v.probs.length === 4 && v.probs.every((p) => typeof p === "number")
      ? (v.probs as number[])
      : null;
  } catch {
    return null;
  }
}

/** The label worth showing on a line, with how sure it was — or null. */
export function emotionMark(
  probs: number[] | null,
  clear: number = CLEAR,
): { emotion: Exclude<Emotion, "neutral">; p: number } | null {
  if (!probs) return null;
  let best = 1;
  for (let i = 2; i < 4; i++) if (probs[i] > probs[best]) best = i;
  if (probs[best] < clear || probs[best] <= probs[0]) return null;
  return { emotion: EMOTIONS[best] as Exclude<Emotion, "neutral">, p: probs[best] };
}
