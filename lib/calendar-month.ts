// The month grid behind the calendar over the meeting list.
//
// Everything here works in the server's local time, deliberately: the dates under meetings in
// the list are formatted by the server too (see docs/troubleshooting.md, "Meeting times are
// hours off"). A calendar that bucketed by UTC while the list printed local time would put a
// 09:00 meeting on the previous day for anyone east of Greenwich, and the two would disagree
// on screen at the same moment.

export type MonthRef = { year: number; month: number }; // month is 1-12, as it is written

/** A cell in the grid. `null` where the week runs outside the month. */
export type DayCell = { key: string; day: number } | null;

const p2 = (n: number) => String(n).padStart(2, "0");

/** "2026-09" — what the month navigation puts in the URL. */
export function monthKey(m: MonthRef): string {
  return `${m.year}-${p2(m.month)}`;
}

/** "2026-09-18" — local, so it agrees with what the list prints. */
export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}

/** Read "2026-09" from the URL, falling back to the month `now` is in. */
export function parseMonth(value: string | undefined, now: Date): MonthRef {
  const m = /^(\d{4})-(\d{2})$/.exec((value ?? "").trim());
  if (m) {
    const year = Number(m[1]);
    const month = Number(m[2]);
    if (month >= 1 && month <= 12 && year >= 1970 && year <= 9999) return { year, month };
  }
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

/** Read "2026-09-18" from the URL. Invalid or absent gives null — no filter. */
export function parseDay(value: string | undefined): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((value ?? "").trim());
  if (!m) return null;
  const [, y, mo, d] = m.map(Number);
  // Round-tripping rejects the 31st of a 30-day month, which JS would otherwise roll forward
  // into the next one — a filter for a day that does not exist showing another day's meetings.
  const date = new Date(y, mo - 1, d);
  return date.getFullYear() === y && date.getMonth() === mo - 1 && date.getDate() === d
    ? dayKey(date)
    : null;
}

export function shiftMonth(m: MonthRef, delta: number): MonthRef {
  const d = new Date(m.year, m.month - 1 + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

/** Half-open [start, end) covering the month, in local time. */
export function monthRange(m: MonthRef): { start: Date; end: Date } {
  return { start: new Date(m.year, m.month - 1, 1), end: new Date(m.year, m.month, 1) };
}

/** Half-open [start, end) covering one day, in local time. */
export function dayRange(key: string): { start: Date; end: Date } | null {
  if (!parseDay(key)) return null;
  const [y, mo, d] = key.split("-").map(Number);
  return { start: new Date(y, mo - 1, d), end: new Date(y, mo - 1, d + 1) };
}

/**
 * Weeks of the month, Monday first.
 *
 * Monday rather than Sunday because this is a work calendar: a week that splits Saturday from
 * Sunday puts the two halves of a weekend at opposite ends of a row.
 */
export function buildGrid(m: MonthRef): DayCell[][] {
  const first = new Date(m.year, m.month - 1, 1);
  const lead = (first.getDay() + 6) % 7; // Sunday is 0 in JS; Monday leads here
  const days = new Date(m.year, m.month, 0).getDate();
  const cells: DayCell[] = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push({ key: `${m.year}-${p2(m.month)}-${p2(d)}`, day: d });
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: DayCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"] as const;

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function monthLabel(m: MonthRef): string {
  return `${MONTH_NAMES[m.month - 1]} ${m.year}`;
}
