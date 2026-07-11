// Date/time formatting helpers (shared by server/client).

const z2 = (n: number) => n.toString().padStart(2, "0");

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function asDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

/** "July 11, 2026, at 16:00" format. null/undefined -> empty string. */
export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return "";
  const d = asDate(value);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}, at ${z2(d.getHours())}:${z2(d.getMinutes())}`;
}

/** "21:30:05" format (for transcript timestamps). null/undefined -> empty string. */
export function formatTime(value: Date | string | null | undefined): string {
  if (!value) return "";
  const d = asDate(value);
  return `${z2(d.getHours())}:${z2(d.getMinutes())}:${z2(d.getSeconds())}`;
}

/** Default meeting title: compact start datetime, "20260711 16:00". */
export function defaultMeetingTitle(now: Date = new Date()): string {
  return `${now.getFullYear()}${z2(now.getMonth() + 1)}${z2(now.getDate())} ${z2(now.getHours())}:${z2(now.getMinutes())}`;
}

/** Format elapsed seconds as "m:ss" / "h:mm:ss" (for in-recording transcript timestamps). */
export function formatOffset(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}:${z2(m)}:${z2(sec)}` : `${m}:${z2(sec)}`;
}

/** Format meeting length like "2 hr 5 min" / "42 min" / "50 sec". null before it ends. */
export function formatDuration(
  startedAt: Date | string,
  endedAt: Date | string | null | undefined,
): string | null {
  if (!endedAt) return null;
  const ms = asDate(endedAt).getTime() - asDate(startedAt).getTime();
  if (!(ms > 0)) return null;
  const totalMin = Math.round(ms / 60000);
  if (totalMin < 1) return `${Math.round(ms / 1000)} sec`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h} hr${m > 0 ? ` ${m} min` : ""}` : `${m} min`;
}
