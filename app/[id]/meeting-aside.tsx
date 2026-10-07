"use client";

import { useState } from "react";
import { useT } from "../locale-provider";

/**
 * The meeting's own details — progress, agenda, who was there, what it was recorded with.
 *
 * A rail beside the minutes at 2xl and wider. Below that there is no room for a rail, so it
 * stacks; and stacked, four cards sit between the top of the page and the thing somebody came
 * to read. On a phone that is a screen and a half of scrolling before the first line of the
 * minutes.
 *
 * So below 2xl it is closed, behind a bar that carries the numbers worth having at a glance.
 * The breakpoint is decided by CSS rather than by measuring the window: the page is rendered on
 * the server, and a component that has to wait for `matchMedia` renders the wrong thing first
 * and then jumps. Here the markup is the same either way — `hidden 2xl:block` opens it on a
 * wide screen with no JavaScript at all, and the button is the narrow case's way in.
 */
export function MeetingAside({ summary, children }: { summary: string; children: React.ReactNode }) {
  const t = useT();
  const [open, setOpen] = useState(false);

  // Open below 2xl, the bar and the cards it opened share one panel, so they read as one thing
  // with its contents rather than as five cards in a row: the bar was a card like the others,
  // and nothing showed that they were inside it. At 2xl there is no bar and no panel, only the
  // rail of cards.
  return (
    <aside
      className={`order-first 2xl:order-none ${
        open
          ? "rounded-2xl border border-[var(--border)] bg-[var(--elevated)] p-2 2xl:rounded-none 2xl:border-0 2xl:bg-transparent 2xl:p-0"
          : ""
      }`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="meeting-details"
        className={`flex w-full flex-wrap items-center gap-x-2 gap-y-1 text-left 2xl:hidden ${
          open ? "rounded-xl px-2 py-1.5 hover:bg-[var(--hover-surface)]" : "card px-4 py-3"
        }`}
      >
        <span
          aria-hidden
          className={`text-[var(--text-secondary)] transition-transform ${open ? "rotate-90" : ""}`}
        >
          ›
        </span>
        <span className="text-sm font-semibold text-[var(--text-strong)]">
          {t("Meeting details")}
        </span>
        {/* Wraps rather than truncating: on a 375px screen this is already the full width of
            the bar, and a longer meeting — two-digit hours, three-digit utterances — would
            lose the end of the line it exists to show. */}
        {summary ? (
          <span className="ml-auto text-xs text-[var(--text-secondary)]">
            {summary}
          </span>
        ) : null}
      </button>

      <div
        id="meeting-details"
        className={`space-y-3 ${open ? "mt-2" : "hidden"} 2xl:mt-0 2xl:block 2xl:space-y-4`}
      >
        {children}
      </div>
    </aside>
  );
}
