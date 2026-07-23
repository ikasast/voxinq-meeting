"use client";

import Link from "next/link";
import { type ReactNode, useState } from "react";
import { SwipeableRow } from "./swipeable-row";

// A recurring series rendered as a "pile" in the meeting list: only the latest
// meeting's card is shown, with offset layers behind it hinting at the older ones.
// A toggle expands the rest inline (indented under the pile); the series name links
// to the series page (timeline + per-series defaults).
export function SeriesStack({
  name,
  seriesId,
  count,
  seriesIds,
  latestId,
  latestTitle,
  latest,
  rest,
}: {
  name: string;
  seriesId: string | null;
  count: number;
  seriesIds: string[];
  latestId: string;
  latestTitle: string;
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
        {/* Collapsed: the swipe acts on the whole series. Expanded: the top card is
            just this one meeting, and each row below carries its own swipe. */}
        {open ? (
          <SwipeableRow ids={[latestId]} label={latestTitle}>
            {latest}
          </SwipeableRow>
        ) : (
          <SwipeableRow ids={seriesIds} label={name}>
            {latest}
          </SwipeableRow>
        )}
      </div>
      <div
        className={`mt-2 flex w-full items-center gap-2 px-2 py-0.5 text-[11px] text-[var(--text-muted)] ${
          open ? "" : "mt-3"
        }`}
      >
        {seriesId ? (
          <Link
            href={`/series/${seriesId}`}
            className="text-[var(--accent-sub)] hover:underline"
            title="Open the series page (timeline & defaults)"
          >
            ↻ {name}
          </Link>
        ) : (
          <span className="text-[var(--accent-sub)]">↻ {name}</span>
        )}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="hover:text-[var(--accent-sub)]"
          aria-expanded={open}
        >
          {open ? `hide ${count - 1} earlier` : `show ${count - 1} earlier ▾`}
        </button>
      </div>
      {open ? (
        <div className="mt-2 space-y-2 border-l-2 border-[var(--border)] pl-2.5">{rest}</div>
      ) : null}
    </div>
  );
}
