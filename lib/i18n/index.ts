// Two languages, and the English is the key.
//
// The usual shape for this is `t("recording.controls.start")`, and it costs something this
// codebase is not willing to pay: you can no longer read a component and know what the screen
// says. Every string becomes a lookup into a file somewhere else, and the JSX stops being
// prose. So the key is the English sentence itself —
//
//   <button>{t("Start recording")}</button>
//
// — which reads as it always did, and makes `ja.ts` an English-to-Japanese table that somebody
// can check without holding the app in their head.
//
// **What that costs, and how it is paid.** Editing the English breaks the mapping silently. So
// a test walks every `t("…")` in the source and fails on a key `ja.ts` has never heard of;
// changing a sentence and forgetting its translation is then a red build rather than a word
// that reverts to English in front of somebody.
//
// No ICU, no plural rules, no message compiler. Japanese has no plural agreement, and the
// English side already writes its own — `t(n === 1 ? "1 utterance" : "{n} utterances", { n })`
// keeps both readable and gives the table one row for each.

import { ja } from "./ja";

export const LOCALES = ["en", "ja"] as const;
export type Locale = (typeof LOCALES)[number];

/** What the setting stores. `auto` follows the browser, which is what a first visit should do. */
export const UI_LANGUAGES = ["auto", ...LOCALES] as const;

const TABLES: Record<Locale, Record<string, string>> = { en: {}, ja };

export function isLocale(v: unknown): v is Locale {
  return typeof v === "string" && (LOCALES as readonly string[]).includes(v);
}

/**
 * The string, in this locale.
 *
 * A key with no translation returns itself. That is the honest failure: an English sentence
 * among Japanese ones is legible, where a raw key like `recording.controls.start` is not, and
 * the test below catches it long before anybody sees it anyway.
 */
export function translate(
  locale: Locale,
  key: string,
  vars?: Record<string, string | number>,
): string {
  const out = TABLES[locale]?.[key] ?? key;
  if (!vars) return out;
  return out.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in vars ? String(vars[name]) : whole,
  );
}

/**
 * Which language to show, from what the person chose and what their browser asked for.
 *
 * `auto` is not a language, it is a deferral — and the thing it defers to is the only signal
 * available for somebody with no account, which read-only visitors are.
 */
export function resolveLocale(setting: string | undefined, acceptLanguage: string | null): Locale {
  if (isLocale(setting)) return setting;
  return preferredFromHeader(acceptLanguage);
}

/** The first language in an Accept-Language header that this app has. English if none does. */
export function preferredFromHeader(header: string | null): Locale {
  if (!header) return "en";
  const tags = header
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.find((p) => p.trim().startsWith("q="));
      return { tag: tag.trim().toLowerCase(), q: q ? Number(q.split("=")[1]) : 1 };
    })
    .filter((t) => t.tag && Number.isFinite(t.q))
    .sort((a, b) => b.q - a.q);
  for (const { tag } of tags) {
    // `ja-JP` and `ja` are the same request. Anything else this app does not have.
    const base = tag.split("-")[0];
    if (isLocale(base)) return base;
  }
  return "en";
}
