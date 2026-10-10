"use client";

import { useSyncExternalStore } from "react";
import { useT } from "@/app/locale-provider";
import { REST_SCREEN_SECONDS, readRestSeconds, subscribeRestSeconds, writeRestSeconds } from "../rest-screen";

// Settings → Appearance: how long the recording screen waits before it goes black, on this
// device (app/rest-screen.ts). Applied as it is chosen, like the theme; nothing to save.

export function RestScreenSetting({ labelClass, inputClass }: { labelClass: string; inputClass: string }) {
  const t = useT();
  const seconds = useSyncExternalStore(subscribeRestSeconds, readRestSeconds, () => 0);
  const label: Record<(typeof REST_SCREEN_SECONDS)[number], string> = {
    0: t("Never — keep the screen on"),
    30: t("After 30 seconds"),
    60: t("After 1 minute"),
    300: t("After 5 minutes"),
    600: t("After 10 minutes"),
  };

  return (
    <div>
      <label htmlFor="restScreenSeconds" className={labelClass}>
        {t("Rest the screen while recording")}
      </label>
      <select
        id="restScreenSeconds"
        value={String(seconds)}
        onChange={(e) => writeRestSeconds(Number(e.target.value))}
        className={`${inputClass} max-w-sm`}
      >
        {REST_SCREEN_SECONDS.map((s) => (
          <option key={s} value={s}>
            {label[s]}
          </option>
        ))}
      </select>
      {/* What it does and what it costs, in a line: recording carries on under a black screen,
          which saves a phone's battery and hides the live transcript. Per device; until chosen,
          phones and the Android app rest after a minute and computers never do. */}
      <p className="mt-1.5 text-xs text-[var(--text-muted)]">
        {t("While recording, the screen goes black after this long; recording carries on. Saves a phone's battery, but hides the live transcript. This device only.")}
      </p>
    </div>
  );
}
