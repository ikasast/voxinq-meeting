"use client";

import { useSyncExternalStore } from "react";
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
// Only in the app; a browser has its own zoom. Applied as it is chosen, like the theme.

const noop = () => () => {};

export function DisplaySizeSetting({ inputClass }: { inputClass: string }) {
  const t = useT();
  const size = useSyncExternalStore(subscribeDisplaySize, readDisplaySize, () => null);
  const app = useSyncExternalStore(noop, inAndroidApp, () => false);
  if (!app || size === null) return null;
  const label: Record<DisplaySize, string> = {
    100: t("Standard (100%)"),
    115: t("Larger (115%)"),
    130: t("Large (130%)"),
  };
  return (
    <div>
      <select
        id="displaySize"
        aria-label={t("Display size")}
        value={String(size)}
        onChange={(e) => writeDisplaySize(Number(e.target.value) as DisplaySize)}
        className={`${inputClass} max-w-sm`}
      >
        {DISPLAY_SIZES.map((s) => (
          <option key={s} value={s}>
            {label[s]}
          </option>
        ))}
      </select>
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
