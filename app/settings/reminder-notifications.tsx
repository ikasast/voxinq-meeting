"use client";

import { useEffect, useState } from "react";
import { useT } from "@/app/locale-provider";
import { CheckIcon } from "../icons";
import { askToNotify, notifyState, showNotification, type NotifyState } from "../device-notifications";

// Settings → Appearance: meeting reminders as notifications on this device, turned on ahead of
// the first one. The due-meeting banner can only offer it once a meeting is already due, so on
// a computer the first reminder was always just the banner.
//
// Per device, like the theme: it is the browser's permission, not a setting on the server.
// Rendered only on the client (Settings waits for its data before drawing a tab), so the state
// can be read as it is created.

export function ReminderNotifications() {
  const t = useT();
  const [state, setState] = useState<NotifyState>(() => notifyState());
  const [test, setTest] = useState<null | "sent" | "failed">(null);

  // The permission can change in the browser's own settings while this page is open; look again
  // when the window comes back.
  useEffect(() => {
    const look = () => setState(notifyState());
    window.addEventListener("focus", look);
    return () => window.removeEventListener("focus", look);
  }, []);

  const turnOn = async () => setState(await askToNotify());

  const sendTest = async () => {
    const ok = await showNotification(
      "Voxinq Meeting",
      t("Notifications are on. A booked meeting will look like this when its time comes."),
      "/",
      "voxinq-test",
    );
    setTest(ok ? "sent" : "failed");
  };

  return (
    <section className="card space-y-3 p-6">
      <h2 className="section-title text-sm font-semibold text-[var(--text-strong)]">
        {t("Meeting reminders on this device")}
      </h2>
      <p className="text-xs text-[var(--text-muted)]">
        {t(
          "When a booked meeting's time comes, this device shows a notification, even while you are looking at another window. Voxinq has to be open in a tab (in the background is fine): with every tab closed nothing arrives, as there is no outside push service. Saved per device (browser).",
        )}
      </p>

      {state === "app" ? (
        <p className="text-sm text-[var(--text-secondary)]">
          {t("In the Android app, reminders come from the app itself and follow the phone's notification settings.")}
        </p>
      ) : state === "insecure" ? (
        <p className="text-sm text-[var(--warning)]">
          {t("Notifications need a secure connection. Open Voxinq through its https address to turn them on.")}
        </p>
      ) : state === "unsupported" ? (
        <p className="text-sm text-[var(--text-secondary)]">{t("This browser cannot show notifications.")}</p>
      ) : state === "denied" ? (
        <p className="text-sm text-[var(--warning)]">
          {t(
            "Blocked for this site. Allow notifications in the browser's site settings (the icon at the left of the address bar), then come back to this page.",
          )}
        </p>
      ) : state === "granted" ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5 text-sm text-[var(--accent-sub)]">
            <CheckIcon className="h-4 w-4" />
            {t("On for this device")}
          </span>
          <button type="button" onClick={() => void sendTest()} className="btn-outline !px-3 !py-1.5 text-xs">
            {t("Send a test notification")}
          </button>
          {test === "sent" ? (
            <span className="text-xs text-[var(--text-muted)]">
              {t("Sent. If nothing appeared, check the notification settings of your operating system.")}
            </span>
          ) : test === "failed" ? (
            <span className="text-xs text-[var(--error)]">{t("The notification could not be shown.")}</span>
          ) : null}
        </div>
      ) : (
        <button type="button" onClick={() => void turnOn()} className="btn-ink">
          {t("Turn on notifications")}
        </button>
      )}
    </section>
  );
}
