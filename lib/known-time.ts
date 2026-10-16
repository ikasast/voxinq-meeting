/**
 * A time a caller knows, if it is one: a date in the past, after the year 2000. A clock a few
 * minutes ahead is allowed for; anything later is a mistake rather than a meeting. For a
 * recording made away from the server — offline on a phone, or in another app — which happened
 * at a time of its own.
 */
export function knownTime(v: unknown): Date | undefined {
  if (typeof v !== "string") return undefined;
  const d = new Date(v);
  const t = d.getTime();
  if (!Number.isFinite(t) || t < Date.UTC(2000, 0, 1) || t > Date.now() + 5 * 60_000) return undefined;
  return d;
}
