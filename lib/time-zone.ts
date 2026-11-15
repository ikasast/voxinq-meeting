// The server's time zone: which clock meeting dates are written in.
//
// Dates on the list, the meeting header, the print page and the exports are formatted on the
// server (lib/i18n/format.ts reads the process's local time). A container has no time zone
// unless it is given one, so an install started from the compose file alone shows UTC. TZ in
// `.env` is one way to fix that; the other is Administration → This machine, or the first-run
// checklist, which offers the time zone of the browser it is opened in.
//
// A choice made in the app wins over the environment, as the other settings that are seeded
// from `.env` do. It takes effect at once: Node re-reads its zone whenever `process.env.TZ` is
// assigned, so there is nothing to restart.

const g = globalThis as unknown as { __voxinqEnvTz?: string | null };

/**
 * TZ as the process was started with it, before this module changed anything. Kept on
 * globalThis because the module can be loaded more than once (each route bundle has its own
 * copy), and a copy loaded after the first assignment would otherwise take the app's choice for
 * the environment's.
 */
function envTimeZone(): string | null {
  if (g.__voxinqEnvTz === undefined) g.__voxinqEnvTz = process.env.TZ?.trim() || null;
  return g.__voxinqEnvTz;
}

/**
 * Whether the environment names a zone somebody chose. The compose file passes `UTC` when `.env`
 * says nothing, so UTC cannot be told apart from "unset" and counts as unset: a person who
 * really wants UTC can still pick it in the app, and the checklist then stops asking.
 */
export function envTimeZoneChosen(): string | null {
  const tz = envTimeZone();
  if (!tz || /^(utc|etc\/utc|gmt|etc\/gmt|z)$/i.test(tz) || !isTimeZone(tz)) return null;
  return tz;
}

/** An IANA zone name this runtime knows, such as "Asia/Tokyo" or "Europe/London". */
export function isTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || !value || value.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** The zone the server writes dates in, for a given saved choice ("" when none was made). */
export function effectiveTimeZone(saved: string): string {
  if (isTimeZone(saved)) return saved;
  return envTimeZone() ?? "UTC";
}

/** Put the saved choice into effect for this process. */
export function applyTimeZone(saved: string): void {
  const tz = effectiveTimeZone(saved);
  if (process.env.TZ !== tz) process.env.TZ = tz;
}
