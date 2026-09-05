// Shared logic for list filtering (search / tag / series).
// Extracted so meeting-list-pane and each page build the same conditions.

import type { Prisma } from "@prisma/client";

/** Build the Prisma where from search/tag (always excludes trash).
 * Archived meetings are hidden from the normal list but surface when a text query is present. */
export function buildMeetingWhere(opts: {
  query?: string;
  tag?: string;
  series?: string;
}): Prisma.MeetingWhereInput {
  const and: Prisma.MeetingWhereInput[] = [{ deletedAt: null }];
  const query = opts.query?.trim();
  const tag = opts.tag?.trim();
  const series = opts.series?.trim();

  if (query) {
    and.push({
      OR: [
        { title: { contains: query, mode: "insensitive" } },
        { description: { contains: query, mode: "insensitive" } },
        { transcripts: { some: { text: { contains: query, mode: "insensitive" } } } },
        { summaries: { some: { summaryText: { contains: query, mode: "insensitive" } } } },
      ],
    });
  } else {
    // No text query: hide archived meetings from the list (they stay searchable).
    and.push({ archivedAt: null });
  }
  if (tag) and.push({ tags: { some: { name: tag } } });
  // By name rather than id: `Series.name` is unique, it is what the chip shows, and it keeps
  // the URL readable in the same way `?tag=` already is.
  if (series) and.push({ series: { name: series } });

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
