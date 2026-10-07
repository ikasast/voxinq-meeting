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
      <p className="mt-1 text-xs text-[var(--text-muted)]">
        {t("After this long without a touch, the recording screen goes black. Tapping brings it back, and it rests again after the same wait. Recording is not affected — the microphone, the upload and the screen lock all keep going.")}
      </p>
      <p className="mt-1 text-xs text-[var(--text-muted)]">
        {t(
          "Saved per device and applied at once. Until it is chosen here, a phone, a tablet or the Android app rests after 1 minute, and a computer never does.",
        )}
      </p>
      <p className="mt-1 text-xs text-[var(--text-secondary)]">
        {t("On a phone with an OLED screen this is most of the battery: black pixels do not light up.")}{" "}
        <strong>{t("You cannot watch the live transcript while it rests")}</strong>
        {t(
          ", which is the trade — worth it for a long meeting recorded from a pocket, not for one you are reading along with.",
        )}
      </p>
    </div>
  );
}
