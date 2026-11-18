/**
 * How long before a booked meeting's time its reminder comes: the banner, the browser's
 * notification and the Android app's notice.
 *
 * It used to be the time itself, which left no moment to set the phone on the table, pick the
 * microphone and press Record before people started talking. Five minutes is that moment, and
 * short enough that the notice is still about this meeting rather than the day ahead.
 *
 * The Android app keeps the same number (`Reminders.NOTICE_AHEAD_MS`); its alarm goes off this
 * long before the meeting, and it asks the server whether the meeting is still coming then.
 */
export const NOTICE_AHEAD_MS = 5 * 60_000;
