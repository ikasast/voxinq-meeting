"use client";

import { createContext, useContext } from "react";
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

/** `const t = useT()`, then `t("Start recording")`. */
export function useT(): (key: string, vars?: Record<string, string | number>) => string {
  const locale = useContext(LocaleContext);
  return (key, vars) => translate(locale, key, vars);
}
