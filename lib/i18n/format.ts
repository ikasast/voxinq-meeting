import type { Locale } from "./index";

// Dates, durations and calendar labels, per language.
//
// These are not dictionary rows. Twelve month names and seven weekday abbreviations would be
// nineteen entries whose translation is not a judgement anybody makes — and the *shape* differs
// too, which a table cannot express: English writes "September 6, 2026, at 15:12" and Japanese
// writes 2026年9月6日 15:12, with the year first and no comma anywhere. So each language gets a
// function, and the table keeps the sentences.
//
// Deliberately not `Intl.DateTimeFormat`. It would produce a defensible string in any locale,
// and a different one depending on the ICU data in whatever runtime this is — a meeting list
// that reads differently on the server and in the browser, and differently again after a Node
// upgrade. These are short, fixed, and the same everywhere.

const z2 = (n: number) => String(n).padStart(2, "0");

const MONTHS_EN = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const MONTH_NAMES_EN = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const asDate = (v: Date | string): Date => (v instanceof Date ? v : new Date(v));

/** "September 6, 2026, at 15:12" / "2026年9月6日 15:12". */
export function formatDateTimeIn(
  locale: Locale,
  value: Date | string | null | undefined,
): string {
  if (!value) return "";
  const d = asDate(value);
  if (locale === "ja") {
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${z2(d.getHours())}:${z2(d.getMinutes())}`;
  }
  return `${MONTHS_EN[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}, at ${z2(d.getHours())}:${z2(d.getMinutes())}`;
}

/** "2 hr 5 min" / "2時間5分". Null for a meeting that has not ended. */
export function formatDurationIn(locale: Locale, ms: number | null | undefined): string | null {
  if (ms == null || !(ms > 0)) return null;
  const totalMin = Math.round(ms / 60000);
  if (totalMin < 1) {
    const sec = Math.round(ms / 1000);
    return locale === "ja" ? `${sec}秒` : `${sec} sec`;
  }
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (locale === "ja") return h > 0 ? `${h}時間${m > 0 ? `${m}分` : ""}` : `${m}分`;
  return h > 0 ? `${h} hr${m > 0 ? ` ${m} min` : ""}` : `${m} min`;
}

/** "September 2026" / "2026年9月", above the calendar grid. */
export function monthLabelIn(locale: Locale, m: { year: number; month: number }): string {
  return locale === "ja"
    ? `${m.year}年${m.month}月`
    : `${MONTH_NAMES_EN[m.month - 1]} ${m.year}`;
}

/**
 * The seven column headers, Monday first.
 *
 * Japanese has single characters for these, which is what a seven-column grid on a phone wants:
 * the English abbreviations are two characters wide and the cells are 44px.
 */
export function weekdaysIn(locale: Locale): readonly string[] {
  return locale === "ja"
    ? (["月", "火", "水", "木", "金", "土", "日"] as const)
    : (["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"] as const);
}
