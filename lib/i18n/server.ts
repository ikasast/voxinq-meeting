import { headers } from "next/headers";
import { type Locale, resolveLocale, translate } from "@/lib/i18n";
import { readSettings } from "@/lib/settings";

// The locale for a server component, and the `t` that goes with it.
//
// Two sources, in this order: what this person chose, and what their browser asked for. The
// second is not a fallback for tidiness — somebody reading a shared read-only link has no
// account and no setting, and the header is all there is.

export async function currentLocale(): Promise<Locale> {
  const [{ uiLanguage }, h] = await Promise.all([readSettings(), headers()]);
  return resolveLocale(uiLanguage, h.get("accept-language"));
}

/** `const t = await serverT()`, then `t("Meetings")`. */
export async function serverT(): Promise<
  (key: string, vars?: Record<string, string | number>) => string
> {
  const locale = await currentLocale();
  return (key, vars) => translate(locale, key, vars);
}
