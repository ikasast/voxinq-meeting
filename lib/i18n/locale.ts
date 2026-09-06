import { type Locale, resolveLocale } from "@/lib/i18n";
import { readSettings } from "@/lib/settings";

/**
 * The locale for one request, from the setting and the one header that carries a preference.
 *
 * Separate from `server.ts` because the proxy needs it too, and the proxy has no `headers()` —
 * it is handed the request itself. Importing `server.ts` there would drag `next/headers` into
 * the proxy bundle for no reason.
 */
export async function localeFor(acceptLanguage: string | null): Promise<Locale> {
  const { uiLanguage } = await readSettings();
  return resolveLocale(uiLanguage, acceptLanguage);
}
