// The parts of a meeting a question is about, rather than all of it.
//
// Asking about a meeting read its whole transcript every time — twenty thousand tokens for an
// hour, which the local model takes half a minute just to read before it writes a word. Most
// questions are about one thing said somewhere in it: who took on the hiring plan, whether the
// price change was settled. So the transcript's lines are scored against the question and only
// the best of them, with the lines around each, are sent.
//
// Scored by two-character sequences, as the meeting search already matches Japanese: no word
// splitter and no second model. A sequence of kana alone is mostly grammar (した, ます, ので)
// and is left out; the rest are weighted by how rare they are across the meeting, so 採用
// counts for more than 会議. What it cannot do is connect two words for one thing — 予算 does
// not find a line that only says お金 — which is why a question about the meeting as a whole,
// or one nothing matches, still reads all of it.

import { estTokens } from "./context";

/** How much of a meeting is sent as an excerpt: a few minutes' reading, not half a minute. */
// Counted by estTokens (1.8 characters a token), which runs short for Japanese on the models in
// use (nearer 1.45): 4500 here is about 5500 the model reads.
export const EXCERPT_TOKENS = 4500;
/** Below this the whole meeting is read: an excerpt would save little and might miss. */
export const EXCERPT_FROM_TOKENS = 8000;
/** Lines kept on each side of a matching one, so an answer has what led up to it. */
const AROUND = 2;

/** Questions about the meeting as a whole: no part of it is "the" part. */
const WHOLE = /要点|要約|まとめ|全体|概要|流れ|振り返|どんな会議|全部|すべての|全て/;

const KANA_ONLY = /^[\p{Script=Hiragana}ー]+$/u;
const WORDLIKE = /^[\p{Script=Han}\p{Script=Katakana}\p{Script=Hiragana}A-Za-z0-9ー]+$/u;

/** The question's sequences worth matching on: no kana-only grammar, no punctuation. */
export function questionGrams(question: string): string[] {
  const chars = [...question.toLowerCase().replace(/\s+/g, "")];
  const grams = new Set<string>();
  for (let i = 0; i < chars.length - 1; i++) {
    const g = chars[i] + chars[i + 1];
    if (WORDLIKE.test(g) && !KANA_ONLY.test(g)) grams.add(g);
  }
  return [...grams];
}

export type Excerpt = {
  text: string;
  /** How many separate stretches of the meeting it holds. */
  parts: number;
};

/**
 * The lines of `conversation` (one utterance a line) that `question` is about, with their
 * neighbours, in order, within `budget` tokens — or null when the whole meeting should be read:
 * it is short, the question is about all of it, or nothing in it matches.
 */
export function excerptFor(question: string, conversation: string, budget = EXCERPT_TOKENS): Excerpt | null {
  if (estTokens(conversation) <= EXCERPT_FROM_TOKENS) return null;
  if (WHOLE.test(question)) return null;
  const grams = questionGrams(question);
  if (grams.length === 0) return null;

  const lines = conversation.split("\n");
  const folded = lines.map((l) => l.toLowerCase());
  // Rarer sequences weigh more; one in nearly every line weighs almost nothing.
  const weight = new Map<string, number>();
  for (const g of grams) {
    const df = folded.reduce((n, l) => n + (l.includes(g) ? 1 : 0), 0);
    if (df > 0) weight.set(g, Math.log(lines.length / df));
  }
  if (weight.size === 0) return null;

  const scored = folded
    .map((l, i) => ({ i, score: [...weight].reduce((s, [g, w]) => s + (l.includes(g) ? w : 0), 0) }))
    .filter((x) => x.score > 0 && lines[x.i].trim())
    .sort((a, b) => b.score - a.score || a.i - b.i);
  if (scored.length === 0) return null;

  // Best first, each with its neighbours, until the budget is spent.
  const keep = new Set<number>();
  let tokens = 0;
  for (const { i } of scored) {
    const window: number[] = [];
    for (let j = Math.max(0, i - AROUND); j <= Math.min(lines.length - 1, i + AROUND); j++) {
      if (!keep.has(j) && lines[j].trim()) window.push(j);
    }
    const cost = window.reduce((n, j) => n + estTokens(lines[j]) + 1, 0);
    if (keep.size > 0 && tokens + cost > budget) break;
    for (const j of window) keep.add(j);
    tokens += cost;
  }

  const order = [...keep].sort((a, b) => a - b);
  const out: string[] = [];
  let parts = 0;
  for (let k = 0; k < order.length; k++) {
    if (k === 0 || order[k] !== order[k - 1] + 1) {
      if (k > 0) out.push("……");
      parts += 1;
    }
    out.push(lines[order[k]]);
  }
  return { text: out.join("\n"), parts };
}
