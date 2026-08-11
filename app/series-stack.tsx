"use client";

import Link from "next/link";
import { type ReactNode, useEffect, useState } from "react";
import { SwipeableRow } from "./swipeable-row";

// A recurring series rendered as one labelled group in the meeting list: a header carrying
// the series name and how many meetings it holds, and a rail down the left tying its cards
// together. Only the latest meeting shows by default; a toggle reveals the rest inline.
// The name links to the series page (timeline + per-series defaults).
export function SeriesStack({
  name,
  seriesId,
  count,
  seriesIds,
  latestId,
  latestTitle,
  readOnly = false,
  defaultOpen = false,
  latest,
  rest,
}: {
  name: string;
  seriesId: string | null;
  count: number;
  seriesIds: string[];
  latestId: string;
  latestTitle: string;
  readOnly?: boolean;
  // Open on first render — used when the meeting being viewed is one of the older ones, so
  // opening it from the list does not fold the series shut around it.
  defaultOpen?: boolean;
  latest: ReactNode;
  rest: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  // Navigating between meetings re-renders the list; depending on whether this component is
  // remounted, the initial state above may not be re-applied. Open (never close) so selecting
  // an older meeting always leaves its series expanded, without undoing a manual collapse.
  useEffect(() => {
    if (defaultOpen) setOpen(true);
  }, [defaultOpen]);

  return (
    <div className="rounded-xl border border-[color-mix(in_srgb,var(--accent)_22%,transparent)] bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] p-2">
      <div className="flex items-center gap-2 px-1 pb-1.5 text-[11px]">
        {seriesId ? (
          <Link
            href={`/series/${seriesId}`}
            className="min-w-0 truncate font-medium text-[var(--accent-sub)] hover:underline"
            title="Open the series page (timeline & defaults)"
          >
            ↻ {name}
          </Link>
        ) : (
          <span className="min-w-0 truncate font-medium text-[var(--accent-sub)]">↻ {name}</span>
        )}
        <span
          className="shrink-0 rounded-full border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] px-1.5 text-[10px] text-[var(--accent-sub)]"
          title={`${count} meetings in this series`}
        >
          {count}
        </span>
        <span className="grow" />
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="shrink-0 text-[var(--text-muted)] hover:text-[var(--accent-sub)]"
          aria-expanded={open}
        >
          {open ? "hide earlier ▴" : `show ${count - 1} earlier ▾`}
        </button>
      </div>

      {/* The rail is what makes the cards read as one series rather than neighbours. */}
      <div className="space-y-2 border-l-2 border-[color-mix(in_srgb,var(--accent)_30%,transparent)] pl-2">
        {/* Collapsed, the group represents the whole series: swiping it archives or trashes
            every meeting at once. Expanded, each row acts on a single meeting.
            Read-only (external) access gets no swipe at all. */}
        {readOnly ? (
          latest
        ) : open ? (
          <SwipeableRow ids={[latestId]} label={latestTitle}>
            {latest}
          </SwipeableRow>
        ) : (
          <SwipeableRow ids={seriesIds} label={name}>
            {latest}
          </SwipeableRow>
        )}
        {open ? rest : null}
      </div>
    </div>
  );
}
