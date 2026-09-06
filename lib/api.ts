import { NextResponse } from "next/server";

/**
 * Shared error response for API routes, in the reader's language.
 *
 * Translated here rather than at each call site, and rather than in the browser: one place
 * instead of seventy, and the routes go on writing their messages as English sentences.
 *
 * Only the messages a person is meant to read have a translation — see
 * `lib/i18n/server-messages.ts` for why "meetingId is required" does not. Everything else falls
 * through as English, which is what it already was.
 *
 * `vars` fills the {placeholders} in the message; `extra` is merged into the body, for the few
 * routes that send something alongside — the id of the job already running, say.
 */
export async function apiError(
  message: string,
  status: number,
  opts: { vars?: Record<string, string | number>; extra?: Record<string, unknown> } = {},
) {
  const { currentLocale } = await import("@/lib/i18n/server");
  const { translate } = await import("@/lib/i18n");
  const error = translate(await currentLocale(), message, opts.vars);
  return NextResponse.json({ error, ...opts.extra }, { status });
}

/** Safely read the request body JSON (null if malformed). */
export async function readJson<T>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}
