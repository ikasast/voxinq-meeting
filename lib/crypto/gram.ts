import { createHmac } from "node:crypto";

// Making encrypted text searchable without being readable.
//
// A column of ciphertext cannot be searched with `LIKE`, and decrypting every meeting on every
// keystroke does not scale past a year of them. So each meeting also carries a set of keyed
// hashes of the two-character sequences its text contains. A search hashes the query the same
// way and looks for meetings holding all of them — the server matches without ever holding the
// words, and the match is an index lookup rather than a scan.
//
// **Two characters, because this is a Japanese app first.** Japanese has no spaces, so a
// word-based index would need a tokeniser and would still fail on the substring searches people
// actually type. Bigrams are what full-text search over Japanese normally uses, and they give
// substring matching for free.
//
// **What this leaks, which is not nothing.** Somebody with the database can see how many
// distinct two-character sequences a meeting contains and which meetings share them — a
// frequency and co-occurrence pattern, not the words. It cannot be turned back into text
// without the key, but it is not zero, and it is written down in the documentation rather than
// left for somebody to discover.
//
// The match is deliberately approximate: "予算会議" becomes 予算/算会/会議, and a meeting
// containing all three elsewhere matches too. That is why every hit is confirmed by decrypting
// the candidates — the index narrows, and the reading decides.

/** Long enough that a gram cannot be guessed by its length; short enough to store a lot of. */
const GRAM_BYTES = 12;

/**
 * The two-character sequences of a string, folded the way a search should be.
 *
 * Case is folded so "Budget" finds "budget". Whitespace is collapsed rather than dropped: a gram
 * spanning a space is a real thing to match on, and removing spaces would make "the cat" and
 * "thecat" the same query.
 */
export function bigrams(text: string): string[] {
  const clean = text.toLowerCase().replace(/\s+/g, " ").trim();
  const chars = [...clean];
  if (chars.length === 0) return [];
  if (chars.length === 1) return [chars[0]];
  const out: string[] = [];
  for (let i = 0; i < chars.length - 1; i++) out.push(chars[i] + chars[i + 1]);
  return out;
}

/** One gram, keyed. The key is the account's, so two people's indexes never line up. */
export function gramToken(gram: string, indexKey: Buffer): string {
  return createHmac("sha256", indexKey).update(gram).digest("base64url").slice(0, GRAM_BYTES * 2);
}

/**
 * The distinct tokens for a piece of text.
 *
 * Distinct because the index answers "does this meeting contain this sequence", not how often —
 * and storing a row per occurrence would multiply the index by the length of the meeting while
 * telling an observer exactly how often each pair appears.
 */
export function tokensFor(text: string, indexKey: Buffer): string[] {
  return [...new Set(bigrams(text))].map((g) => gramToken(g, indexKey));
}

/**
 * The tokens a query has to match.
 *
 * A one-character query has no bigram, so it cannot use the index at all. The caller falls back
 * to reading, which for one character is the only honest answer anyway.
 */
export function queryTokens(query: string, indexKey: Buffer): string[] | null {
  const grams = bigrams(query);
  if (grams.length === 0) return null;
  if (grams.length === 1 && [...query.trim()].length < 2) return null;
  return [...new Set(grams)].map((g) => gramToken(g, indexKey));
}
