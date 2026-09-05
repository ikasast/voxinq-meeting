// Where a meeting sits relative to now, as a label for the list.
//
// The list is scanned far more often than it is read, and "is this recent?" is the question
// being asked while scanning. Three bands answer it without anybody parsing a date.
//
// `now` is passed in rather than read here: it makes the boundaries testable, and it means one
// render uses one clock reading rather than a different one per row.

export const BANDS = ["This week", "Over a week ago", "Over a month ago"] as const;
export type Band = (typeof BANDS)[number];

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

export function bandOf(startedAt: Date, now: number): Band {
  // A meeting whose start is in the future is not "in the future" here: booked meetings are
  // listed separately, and anything left is a recording that has just begun.
  const age = Math.max(0, now - startedAt.getTime());
  if (age < WEEK_MS) return "This week";
  if (age < MONTH_MS) return "Over a week ago";
  return "Over a month ago";
}
