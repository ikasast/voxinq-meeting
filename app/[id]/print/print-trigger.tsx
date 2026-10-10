"use client";

import { useEffect } from "react";
import { useT } from "../../locale-provider";

/**
 * Opens the browser's print dialog, where "Save as PDF" is one of the destinations.
 *
 * With `auto` it opens as the sheet arrives — the download menu loads the sheet in a hidden
 * frame for that — and a frame takes itself away once the dialog closes. The button stays for
 * a dialog that was cancelled, and for the sheet opened by hand.
 */
export function PrintTrigger({ auto = false }: { auto?: boolean }) {
  const t = useT();
  useEffect(() => {
    if (!auto) return;
    const done = () => {
      // In the menu's frame, the frame is only there for this; in a tab, the tab stays.
      if (window.frameElement) setTimeout(() => window.frameElement?.remove(), 0);
    };
    window.addEventListener("afterprint", done);
    void document.fonts.ready.then(() => window.print());
    return () => window.removeEventListener("afterprint", done);
  }, [auto]);
  return (
    <button type="button" className="btn-ink" onClick={() => window.print()}>
      {t("Print / Save as PDF")}
    </button>
  );
}
