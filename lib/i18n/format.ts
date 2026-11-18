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

/**
 * The short form for a list on a phone: "Oct 16, 14:58" / "10/16 14:58" this year, and the date
 * alone otherwise ("Oct 16, 2025" / "2025/10/16"). The long form took most of a narrow row, and
 * the meeting's name was what gave way.
 */
export function formatShortDateTimeIn(
  locale: Locale,
  value: Date | string | null | undefined,
  now: Date = new Date(),
): string {
  if (!value) return "";
  const d = asDate(value);
  const thisYear = d.getFullYear() === now.getFullYear();
  if (locale === "ja") {
    return thisYear
      ? `${d.getMonth() + 1}/${d.getDate()} ${z2(d.getHours())}:${z2(d.getMinutes())}`
      : `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
  }
  return thisYear
    ? `${MONTHS_EN[d.getMonth()]} ${d.getDate()}, ${z2(d.getHours())}:${z2(d.getMinutes())}`
    : `${MONTHS_EN[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
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

/**
 * "48 sec" / "1 min 48 sec" / "1 hr 5 min", and the same in Japanese. For how long a piece of
 * work took, where the seconds matter until it runs into hours — unlike a meeting's length,
 * which formatDurationIn rounds to the minute.
 */
export function formatSpanIn(locale: Locale, ms: number | null | undefined): string | null {
  if (ms == null || !(ms >= 0)) return null;
  const s = Math.round(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (locale === "ja") {
    if (h > 0) return `${h}時間${m}分`;
    return m > 0 ? `${m}分${sec}秒` : `${sec}秒`;
  }
  if (h > 0) return `${h} hr ${m} min`;
  return m > 0 ? `${m} min ${sec} sec` : `${sec} sec`;
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

const WEEKDAYS_JA = ["日", "月", "火", "水", "木", "金", "土"] as const;
const WEEKDAYS_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/**
 * When a booked meeting is, as its row in the sidebar's Upcoming says it — by how near it is.
 * A meeting is planned by the clock, so the clock is what most of these say; only within the
 * hour does what is left matter more than the time it starts:
 *
 *   within the hour   "35分後" / "in 35 min"
 *   later today       "15:00"
 *   tomorrow          "明日 10:00" / "Tomorrow 10:00"
 *   within the week   "金 14:00" / "Fri 14:00"
 *   further           "11/28" / "Nov 28"
 *
 * One whose time has passed with nothing recorded says when it was, the same way ("昨日 13:00"),
 * and `past` tells the row to draw it quieter. Days are this device's own.
 */
export function formatUpcomingIn(
  locale: Locale,
  value: Date | string,
  now: Date = new Date(),
): { text: string; past: boolean } {
  const d = asDate(value);
  const ms = d.getTime() - now.getTime();
  const time = `${z2(d.getHours())}:${z2(d.getMinutes())}`;
  const dayOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  // Calendar days apart, by local midnight: a meeting at 09:00 tomorrow is one day off at 23:00.
  const days = Math.round((dayOf(d) - dayOf(now)) / 86_400_000);
  const ja = locale === "ja";
  if (ms > 0 && ms <= 60 * 60_000) {
    const min = Math.max(1, Math.ceil(ms / 60_000));
    return { text: ja ? `${min}分後` : `in ${min} min`, past: false };
  }
  const past = ms <= 0;
  let text: string;
  if (days === 0) text = time;
  else if (days === 1) text = ja ? `明日 ${time}` : `Tomorrow ${time}`;
  else if (days === -1) text = ja ? `昨日 ${time}` : `Yesterday ${time}`;
  else if (days > 1 && days < 7) text = `${(ja ? WEEKDAYS_JA : WEEKDAYS_EN)[d.getDay()]} ${time}`;
  else if (d.getFullYear() === now.getFullYear()) text = ja ? `${d.getMonth() + 1}/${d.getDate()}` : `${MONTHS_EN[d.getMonth()]} ${d.getDate()}`;
  else text = ja ? `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}` : `${MONTHS_EN[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  return { text, past };
}
