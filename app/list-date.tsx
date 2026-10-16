import type { Locale } from "@/lib/i18n";
import { formatDateTimeIn, formatShortDateTimeIn } from "@/lib/i18n/format";

// When a meeting in a list happened: the short form on a phone, the long one from `sm` up
// (lib/i18n/format.ts). Both are in the page, so the server and the browser agree on it.
export function ListDate({ locale, at }: { locale: Locale; at: Date | string }) {
  return (
    <>
      <span className="sm:hidden">{formatShortDateTimeIn(locale, at)}</span>
      <span className="hidden sm:inline">{formatDateTimeIn(locale, at)}</span>
    </>
  );
}
