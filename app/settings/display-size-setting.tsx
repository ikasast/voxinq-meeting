"use client";

import { useState, useSyncExternalStore } from "react";
import { useT } from "@/app/locale-provider";
import {
  DISPLAY_SIZES,
  inAndroidApp,
  readDisplaySize,
  subscribeDisplaySize,
  writeDisplaySize,
  type DisplaySize,
} from "../display-size";

// Settings → Appearance: how large the Android app draws the pages (app/display-size.ts).
// Only in the app; a browser has its own zoom.
//
// A slider with − and +, like Android's own Display size (asked 2026-11-03; it was a select).
// The size is applied when the slider is let go rather than at every step it passes: each one
// lays the page out again, under the finger that is dragging.

const noop = () => () => {};

export function DisplaySizeSetting() {
  const t = useT();
  const size = useSyncExternalStore(subscribeDisplaySize, readDisplaySize, () => null);
  const app = useSyncExternalStore(noop, inAndroidApp, () => false);
  // Where the slider is while it is held, before it is applied.
  const [held, setHeld] = useState<number | null>(null);
  if (!app || size === null) return null;

  const at = held ?? DISPLAY_SIZES.indexOf(size);
  const apply = (i: number) => {
    setHeld(null);
    const next = DISPLAY_SIZES[Math.max(0, Math.min(DISPLAY_SIZES.length - 1, i))] as DisplaySize;
    if (next !== size) writeDisplaySize(next);
  };
  const step = "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg text-[var(--text-secondary)] hover:bg-[var(--hover-surface)] disabled:opacity-40";

  return (
    <div className="max-w-sm">
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => apply(at - 1)} disabled={at <= 0} className={step} aria-label={t("Smaller")}>
          −
        </button>
        <input
          id="displaySize"
          type="range"
          min={0}
          max={DISPLAY_SIZES.length - 1}
          step={1}
          value={at}
          aria-label={t("Display size")}
          aria-valuetext={`${DISPLAY_SIZES[at]}%`}
          onChange={(e) => setHeld(Number(e.target.value))}
          onPointerUp={(e) => apply(Number(e.currentTarget.value))}
          onKeyUp={(e) => apply(Number(e.currentTarget.value))}
          className="min-w-0 flex-1 accent-[var(--accent-solid)]"
        />
        <button
          type="button"
          onClick={() => apply(at + 1)}
          disabled={at >= DISPLAY_SIZES.length - 1}
          className={step}
          aria-label={t("Larger")}
        >
          +
        </button>
      </div>
      <p className="mt-1 text-center text-sm tabular-nums text-[var(--text-strong)]">{DISPLAY_SIZES[at]}%</p>
      <p className="mt-1.5 text-xs text-[var(--text-muted)]">
        {t("Text, icons and spacing together, in this app only. The phone's own font size still applies on top.")}
      </p>
    </div>
  );
}

/** Whether the row belongs on this screen at all. */
export function useInAndroidApp(): boolean {
  return useSyncExternalStore(noop, inAndroidApp, () => false);
}
