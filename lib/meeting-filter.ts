// Shared logic for list filtering (search / tag).
// Extracted so meeting-list-pane and each page build the same conditions.

import type { Prisma } from "@prisma/client";

/** Build the Prisma where from search/tag (always excludes trash).
 * Archived meetings are hidden from the normal list but surface when a text query is present. */
export function buildMeetingWhere(opts: {
  query?: string;
  tag?: string;
}): Prisma.MeetingWhereInput {
  const and: Prisma.MeetingWhereInput[] = [{ deletedAt: null }];
  const query = opts.query?.trim();
  const tag = opts.tag?.trim();

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
