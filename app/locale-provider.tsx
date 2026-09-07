"use client";

import { createContext, useCallback, useContext } from "react";
import { type Locale, translate } from "@/lib/i18n";

// The locale, for the fifty-odd client components that cannot read a setting themselves.
//
// Resolved once on the server — where the person's setting and their Accept-Language both are —
// and handed down. Not fetched in the browser: the first paint would be English and then swap,
// which is worse than English that stays English.

const LocaleContext = createContext<Locale>("en");

export function LocaleProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export function useLocale(): Locale {
  return useContext(LocaleContext);
}

/**
 * `const t = useT()`, then `t("Start recording")`.
 *
 * Memoised on the locale, which never changes within a page. It has to be: a fresh closure each
 * render is a dependency that always differs, and an effect that lists `t` then runs on every
 * render. The health indicator does list it, so an unmemoised `t` meant a health check — three
 * network requests — every time anything on the page re-rendered.
 */
export function useT(): (key: string, vars?: Record<string, string | number>) => string {
  const locale = useContext(LocaleContext);
  return useCallback(
    (key: string, vars?: Record<string, string | number>) => translate(locale, key, vars),
    [locale],
  );
}
