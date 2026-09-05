// Shared logic for list filtering (search / tag / series).
// Extracted so meeting-list-pane and each page build the same conditions.

import type { Prisma } from "@prisma/client";
import { dayRange } from "./calendar-month";

/** Build the Prisma where from search/tag (always excludes trash).
 * Archived meetings are hidden from the normal list but surface when a text query is present. */
export function buildMeetingWhere(opts: {
  query?: string;
  tag?: string;
  series?: string;
  /** "2026-09-18" — one day, picked from the calendar. */
  date?: string;
  /**
   * Keyed hashes of the query's two-character sequences, when the reader has a key.
   *
   * With these, the text conditions below cannot work: `contains` against ciphertext matches
   * nothing. A meeting has to hold *every* token — which narrows to candidates rather than
   * answering, because bigrams overlap: "予算会議" becomes 予算/算会/会議, and a meeting holding
   * all three somewhere else matches too. The caller reads the candidates to decide.
   */
  grams?: string[] | null;
}): Prisma.MeetingWhereInput {
  const and: Prisma.MeetingWhereInput[] = [{ deletedAt: null }];
  const query = opts.query?.trim();
  const tag = opts.tag?.trim();
  const series = opts.series?.trim();

  if (query) {
    if (opts.grams && opts.grams.length > 0) {
      // Every token, so the meeting contains all of the query's sequences somewhere. The title
      // and description go into the index too, so this one condition covers what the four
      // conditions below used to — one search box should not quietly search two sets of things.
      and.push({
        AND: opts.grams.map((token) => ({ grams: { some: { token } } })),
      });
    } else {
      // No key, or a query too short to make a bigram from. Plaintext still matches: an account
      // with no key has all of its content this way, and even an encrypted one keeps its titles
      // in the clear.
      and.push({
        OR: [
          { title: { contains: query, mode: "insensitive" } },
          { description: { contains: query, mode: "insensitive" } },
          { transcripts: { some: { text: { contains: query, mode: "insensitive" } } } },
          { summaries: { some: { summaryText: { contains: query, mode: "insensitive" } } } },
        ],
      });
    }
  } else {
    // No text query: hide archived meetings from the list (they stay searchable).
    and.push({ archivedAt: null });
  }
  if (tag) and.push({ tags: { some: { name: tag } } });
  // By name rather than id: `Series.name` is unique, it is what the chip shows, and it keeps
  // the URL readable in the same way `?tag=` already is.
  if (series) and.push({ series: { name: series } });
  // A day the calendar could not have drawn filters nothing rather than everything: `dayRange`
  // returns null for it, and silently showing the whole list would look like the click missed.
  const range = opts.date ? dayRange(opts.date.trim()) : null;
  if (range) and.push({ startedAt: { gte: range.start, lt: range.end } });

  return { AND: and };
}

/** Extract a snippet around the query from text (radius chars on each side). */
export function makeSnippet(text: string, query: string, radius = 30): string | null {
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx < 0) return null;
  const start = Math.max(0, idx - radius);
  const end = Math.min(text.length, idx + query.length + radius);
  return (start > 0 ? "…" : "") + text.slice(start, end).replace(/\s+/g, " ").trim() + (end < text.length ? "…" : "");
}
