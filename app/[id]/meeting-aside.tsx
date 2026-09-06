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

  return (
    <aside className="order-first 2xl:order-none">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="meeting-details"
        className="card flex w-full flex-wrap items-center gap-x-2 gap-y-1 px-4 py-3 text-left 2xl:hidden"
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
        className={`space-y-4 ${open ? "mt-4" : "hidden"} 2xl:mt-0 2xl:block`}
      >
        {children}
      </div>
    </aside>
  );
}
