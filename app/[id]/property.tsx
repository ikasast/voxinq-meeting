import type { ReactNode } from "react";

// A meeting's details as a table under its title (v4, design B): a muted label at the left, the
// value at the right, no box around either. The rows come from several components — the
// participants, the agenda, the settings it was made with — so the table is a grid on the page
// and each component hands it rows; `Prop` is one row.

/** The table the rows sit in. */
export const PROPS_GRID = "grid grid-cols-[5.5rem_minmax(0,1fr)] items-baseline gap-x-4 gap-y-2 text-sm";

/** Something that takes the table's whole width: an editor opened from a row, a fold. */
export const PROPS_WIDE = "col-span-2";

/** A small borderless button at the end of a row. */
export const PROP_BUTTON =
  "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-[var(--text-muted)] hover:bg-[var(--hover-surface)] hover:text-[var(--foreground)] disabled:opacity-50";

export function Prop({ label, action, children }: { label: string; action?: ReactNode; children: ReactNode }) {
  return (
    <>
      <div className="text-[var(--text-muted)]">{label}</div>
      {/* The pencil sits right after the value it edits, not at the far end of the row where
          it could belong to anything. No taller than the text, so the row spaces like the rest. */}
      <div className="flex min-w-0 items-start gap-1">
        <div className="min-w-0 text-[var(--foreground)]">{children}</div>
        {action ? <div className="-my-0.5 shrink-0">{action}</div> : null}
      </div>
    </>
  );
}
