"use client";

/** Opens the browser's print dialog, where "Save as PDF" is one of the destinations. */
export function PrintTrigger() {
  return (
    <button type="button" className="btn-ink" onClick={() => window.print()}>
      Print / Save as PDF
    </button>
  );
}
