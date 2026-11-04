"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useT } from "@/app/locale-provider";
import { FieldRow } from "@/app/field-row";
import { Switch } from "@/app/switch";
import { openAppNotificationSettings } from "@/lib/stt/native";
import { askToNotify, notifyState, setRemindersOn, showNotification, type NotifyState } from "../device-notifications";

// Settings → Appearance: a notification on this device when a booked meeting is due, turned on
// ahead of the first one. The due-meeting banner can only offer it once a meeting is already
// due, so on a computer the first reminder was always just the banner.
//
// One row with a switch (2026-11-03). It was a section with a heading and two sentences that
// still did not say what it did. In the Android app the reminders are the app's own, governed by
// its notification settings, so the row opens those instead of asking the browser.
//
// Per device, like the theme: it is the browser's permission, not a setting on the server.
// Rendered only on the client (Settings waits for its data before drawing a tab), so the state
// can be read as it is created.

export function ReminderNotifications({ tag }: { tag?: ReactNode }) {
  const t = useT();
  const [state, setState] = useState<NotifyState>(() => notifyState());
  const [test, setTest] = useState<null | "sent" | "failed">(null);
  const [appSettings, setAppSettings] = useState<null | "failed">(null);

  // The permission can change in the browser's own settings while this page is open; look again
  // when the window comes back.
  useEffect(() => {
    const look = () => setState(notifyState());
    window.addEventListener("focus", look);
    return () => window.removeEventListener("focus", look);
  }, []);

  const label = t("Meeting start notifications");

  if (state === "app") {
    return (
      <FieldRow
        label={label}
        tag={tag}
        hint={
          appSettings === "failed" ? (
            <p>{t("Open the phone's Settings → Apps → Voxinq → Notifications.")}</p>
          ) : (
            <p>{t("When a booked meeting's time comes, this device is notified.")}</p>
          )
        }
      >
        <button
          type="button"
          onClick={() => void openAppNotificationSettings().then((ok) => setAppSettings(ok ? null : "failed"))}
          className="mt-1.5 text-sm text-[var(--accent-sub)] hover:underline"
        >
          {t("Open the app's notification settings")}
        </button>
      </FieldRow>
    );
  }

  const on = state === "granted";
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
    <FieldRow
      label={label}
      tag={tag}
      hint={
        <>
          <p>{t("When a booked meeting's time comes, this device is notified. Only while Voxinq is open in a tab.")}</p>
          {state === "insecure" ? (
            <p className="text-[var(--warning)]">
              {t("Notifications need a secure connection. Open Voxinq through its https address to turn them on.")}
            </p>
          ) : state === "unsupported" ? (
            <p className="text-[var(--warning)]">{t("This browser cannot show notifications.")}</p>
          ) : state === "denied" ? (
            <p className="text-[var(--warning)]">{t("Blocked for this site. Allow notifications in the browser's site settings.")}</p>
          ) : null}
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-3 pt-1.5">
        <Switch
          on={on}
          label={label}
          disabled={state === "insecure" || state === "unsupported" || state === "denied"}
          onChange={(next) => {
            setTest(null);
            if (!next) setState(setRemindersOn(false));
            else if (state === "off") setState(setRemindersOn(true));
            else void askToNotify().then(setState);
          }}
        />
        {on ? (
          <button type="button" onClick={() => void sendTest()} className="btn-outline !px-3 !py-1.5 text-xs">
            {t("Send a test notification")}
          </button>
        ) : null}
        {test === "sent" ? (
          <span className="text-xs text-[var(--text-muted)]">
            {t("Sent. If nothing appeared, check the notification settings of your operating system.")}
          </span>
        ) : test === "failed" ? (
          <span className="text-xs text-[var(--error)]">{t("The notification could not be shown.")}</span>
        ) : null}
      </div>
    </FieldRow>
  );
}
