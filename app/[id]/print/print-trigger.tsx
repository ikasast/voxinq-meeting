"use client";

import { useT } from "../../locale-provider";

/** Opens the browser's print dialog, where "Save as PDF" is one of the destinations. */
export function PrintTrigger() {
  const t = useT();
  return (
    <button type="button" className="btn-ink" onClick={() => window.print()}>
      {t("Print / Save as PDF")}
    </button>
  );
}
