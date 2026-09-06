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

/**
 * The shapes on offer.
 *
 * `sample` is what the settings screen shows: the same date in each, so the choice is made by
 * looking rather than by decoding an abbreviation. Ids are stored, never shown — renaming a
 * label is then a change of wording and not a migration.
 */
export const TITLE_FORMATS = [
  { id: "compact", sample: "20260711", of: (d: Date) => `${d.getFullYear()}${z2(d.getMonth() + 1)}${z2(d.getDate())}` },
  { id: "iso", sample: "2026-07-11", of: (d: Date) => `${d.getFullYear()}-${z2(d.getMonth() + 1)}-${z2(d.getDate())}` },
  { id: "mdy", sample: "Jul 11, 2026", of: (d: Date) => `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}` },
  { id: "dmy", sample: "11 Jul 2026", of: (d: Date) => `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}` },
  { id: "ja", sample: "2026年7月11日", of: (d: Date) => `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日` },
] as const;

export type TitleFormatId = (typeof TITLE_FORMATS)[number]["id"];

/** What an instance that has never been asked uses. Where this app started, so nobody's titles change under them. */
export const DEFAULT_TITLE_FORMAT: TitleFormatId = "compact";

export function isTitleFormat(v: unknown): v is TitleFormatId {
  return typeof v === "string" && TITLE_FORMATS.some((f) => f.id === v);
}

/**
 * The title a meeting gets when nobody types one.
 *
 * The day, not the minute: the time is already on the row beside the title in the list, along
 * with the duration and the utterance count.
 *
 * `day` is the day the meeting is *for*, which is not always today — one booked from the
 * calendar is named for the day it was booked on. An unknown format falls back rather than
 * throwing: this value comes from a hand-editable settings file.
 */
export function defaultMeetingTitle(day: Date = new Date(), format?: string): string {
  const chosen = TITLE_FORMATS.find((f) => f.id === format) ?? TITLE_FORMATS[0];
  return chosen.of(day);
}
