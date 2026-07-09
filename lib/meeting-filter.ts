// Shared logic for list filtering (search / tag / period).
// Extracted so meeting-list-pane and each page build the same conditions.

import type { Prisma } from "@prisma/client";

export type Period = "" | "today" | "week" | "month";

const PERIOD_LABELS: Record<Exclude<Period, "">, string> = {
  today: "Today",
  week: "This week",
  month: "This month",
};

export function periodLabel(p: Period): string | null {
  return p && p in PERIOD_LABELS ? PERIOD_LABELS[p as Exclude<Period, "">] : null;
}

/** period string -> lower bound for startedAt (null if none). Week starts on Monday. */
export function periodStart(p: Period, now = new Date()): Date | null {
  if (p === "today") {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  if (p === "week") {
    const d = new Date(now);
    const dow = (d.getDay() + 6) % 7; // Monday=0
    d.setDate(d.getDate() - dow);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  if (p === "month") {
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }
  return null;
}

/** Build the Prisma where from search/tag/period (always excludes trash). */
export function buildMeetingWhere(opts: {
  query?: string;
  tag?: string;
  period?: Period;
}): Prisma.MeetingWhereInput {
  const and: Prisma.MeetingWhereInput[] = [{ deletedAt: null }];
  const query = opts.query?.trim();
  const tag = opts.tag?.trim();
  const from = periodStart(opts.period ?? "");

  if (query) {
    and.push({
      OR: [
        { title: { contains: query, mode: "insensitive" } },
        { description: { contains: query, mode: "insensitive" } },
        { transcripts: { some: { text: { contains: query, mode: "insensitive" } } } },
        { summaries: { some: { summaryText: { contains: query, mode: "insensitive" } } } },
      ],
    });
  }
  if (tag) and.push({ tags: { some: { name: tag } } });
  if (from) and.push({ startedAt: { gte: from } });

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
