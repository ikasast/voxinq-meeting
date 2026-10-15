// What a meeting is called before anybody names it.
//
// The compact `20260711` this started with is a Japanese habit, and a title is read far more
// often than it is written — by whoever opens the list months later, in whatever order their
// country writes dates in. So it is a choice.
//
// **A list, not a format string.** `yyyy-MM-dd` is a small language, and asking somebody to
// learn one to change how a date looks is a worse deal than four samples to point at. The cost
// is that adding a shape means editing this file, which is the right cost: each of these has to
// be legible in a narrow list, and that is a judgement rather than a substitution.

const z2 = (n: number) => String(n).padStart(2, "0");

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const compact = (d: Date) => `${d.getFullYear()}${z2(d.getMonth() + 1)}${z2(d.getDate())}`;
const mdy = (d: Date) => `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
const dmy = (d: Date) => `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
const ja = (d: Date) => `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
const hm = (d: Date) => `${z2(d.getHours())}:${z2(d.getMinutes())}`;

/**
 * The shapes on offer.
 *
 * `sample` is what the settings screen shows: the same moment in each, so the choice is made by
 * looking rather than by decoding an abbreviation. Ids are stored, never shown — renaming a
 * label is then a change of wording and not a migration.
 *
 * Each date comes with and without the time: two meetings on one afternoon are told apart in a
 * list by their names as well as by the row's clock. `2026-07-11` was dropped to keep the list
 * short; an instance that chose it is given the compact shape (see `shape`). And there is
 * "blank": the name is asked for every time, for whoever would rather name each meeting than
 * rename it later.
 */
export const TITLE_FORMATS = [
  { id: "blank", sample: "", of: () => "" },
  { id: "compact", sample: "20260711", of: (d: Date) => compact(d) },
  { id: "compact-time", sample: "20260711 14:30", of: (d: Date) => `${compact(d)} ${hm(d)}` },
  { id: "mdy", sample: "Jul 11, 2026", of: (d: Date) => mdy(d) },
  { id: "mdy-time", sample: "Jul 11, 2026 14:30", of: (d: Date) => `${mdy(d)} ${hm(d)}` },
  { id: "dmy", sample: "11 Jul 2026", of: (d: Date) => dmy(d) },
  { id: "dmy-time", sample: "11 Jul 2026 14:30", of: (d: Date) => `${dmy(d)} ${hm(d)}` },
  { id: "ja", sample: "2026年7月11日", of: (d: Date) => ja(d) },
  { id: "ja-time", sample: "2026年7月11日 14:30", of: (d: Date) => `${ja(d)} ${hm(d)}` },
] as const;

export type TitleFormatId = (typeof TITLE_FORMATS)[number]["id"];

/** What an instance that has never been asked uses. Where this app started, so nobody's titles change under them. */
export const DEFAULT_TITLE_FORMAT: TitleFormatId = "compact";

function shape(format?: string) {
  return TITLE_FORMATS.find((f) => f.id === format) ?? TITLE_FORMATS.find((f) => f.id === DEFAULT_TITLE_FORMAT)!;
}

/**
 * The name a meeting is offered before anybody types one — empty when the reader chose "blank",
 * and then the New meeting form asks for one.
 *
 * `day` is the moment the meeting is *for*, which is not always now — one booked from the
 * calendar is named for when it was booked. An unknown format falls back rather than throwing:
 * this value comes from a hand-editable settings file.
 */
export function defaultMeetingTitle(day: Date = new Date(), format?: string): string {
  return shape(format).of(day);
}

/**
 * The name for a meeting made where nobody is asked — Record now, the Android app's widget, an
 * upload. Never empty: with "blank" chosen there is no one to fill it in, so it is the date.
 */
export function namedMeetingTitle(day: Date = new Date(), format?: string): string {
  return defaultMeetingTitle(day, format) || shape(DEFAULT_TITLE_FORMAT).of(day);
}
