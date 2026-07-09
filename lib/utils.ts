// Date/time formatting helpers (shared by server/client).
// In Voxinq, dates are always aligned to the zero-padded "yyyy/MM/dd HH:mm" format.

const z2 = (n: number) => n.toString().padStart(2, "0");

function asDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

/** "2026/07/05 21:30" format. null/undefined -> empty string. */
export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return "";
  const d = asDate(value);
  return `${d.getFullYear()}/${z2(d.getMonth() + 1)}/${z2(d.getDate())} ${z2(d.getHours())}:${z2(d.getMinutes())}`;
}

/** "21:30:05" format (for transcript timestamps). null/undefined -> empty string. */
export function formatTime(value: Date | string | null | undefined): string {
  if (!value) return "";
  const d = asDate(value);
  return `${z2(d.getHours())}:${z2(d.getMinutes())}:${z2(d.getSeconds())}`;
}

/** Default meeting title. Uses the start datetime as the title. */
export function defaultMeetingTitle(now: Date = new Date()): string {
  return formatDateTime(now);
}

/** Format elapsed seconds as "m:ss" / "h:mm:ss" (for in-recording transcript timestamps). */
export function formatOffset(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}:${z2(m)}:${z2(sec)}` : `${m}:${z2(sec)}`;
}

/** Format meeting length like "1時間5分" / "42分" / "50秒". null before it ends. */
export function formatDuration(
  startedAt: Date | string,
  endedAt: Date | string | null | undefined,
): string | null {
  if (!endedAt) return null;
  const ms = asDate(endedAt).getTime() - asDate(startedAt).getTime();
  if (!(ms > 0)) return null;
  const totalMin = Math.round(ms / 60000);
  if (totalMin < 1) return `${Math.round(ms / 1000)}秒`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}時間${m > 0 ? `${m}分` : ""}` : `${m}分`;
}
