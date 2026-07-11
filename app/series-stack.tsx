"use client";

import { type ReactNode, useState } from "react";

// A recurring series rendered as a "pile" in the meeting list: only the latest
// meeting's card is shown, with offset layers behind it hinting at the older ones.
// A toggle expands the rest inline (indented under the pile).
export function SeriesStack({
  name,
  count,
  latest,
  rest,
}: {
  name: string;
  count: number;
  latest: ReactNode;
  rest: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <div className="relative">
        {!open ? (
          <>
            {/* stacked-pile hint: two offset card edges behind the latest card */}
            <span
              aria-hidden
              className="absolute inset-x-3 -bottom-2 top-3 -z-20 rounded-lg border border-[var(--border)] bg-[var(--surface)]"
            />
            <span
              aria-hidden
              className="absolute inset-x-1.5 -bottom-1 top-1.5 -z-10 rounded-lg border border-[var(--border)] bg-[var(--surface)]"
            />
          </>
        ) : null}
        {latest}
      </div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`mt-2 flex w-full items-center gap-1.5 rounded-md px-2 py-0.5 text-left text-[11px] text-[var(--text-muted)] hover:text-[var(--accent-sub)] ${
          open ? "" : "mt-3"
        }`}
        aria-expanded={open}
      >
        <span className="text-[var(--accent-sub)]">↻ {name}</span>
        {open ? `hide ${count - 1} earlier` : `show ${count - 1} earlier ▾`}
      </button>
      {open ? (
        <div className="mt-2 space-y-2 border-l-2 border-[var(--border)] pl-2.5">{rest}</div>
      ) : null}
    </div>
  );
}
