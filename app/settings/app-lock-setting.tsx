"use client";

import { useEffect, useState } from "react";
import { useT } from "@/app/locale-provider";
import { Switch } from "@/app/switch";
import { FieldRow } from "@/app/field-row";
import { appLockState, onAppLockChange, setAppLock, type AppLockState } from "@/lib/stt/native";

// Settings → Appearance: locking the Android app behind the phone's fingerprint, face or screen
// lock (android/.../AppLock.kt). Per phone, like the display size beside it, and kept by the app
// rather than here — this only shows it and asks for changes. Nothing at all from an app too old
// to have a lock: it never answers, and a switch that did nothing would be worse than none.

const MINUTES = [0, 1, 5, 15, 60] as const;

export function AppLockSetting({ inputClass }: { inputClass: string }) {
  const t = useT();
  const [state, setState] = useState<AppLockState | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    void appLockState().then((s) => {
      if (live && s) setState(s);
    });
    const off = onAppLockChange((s) => setState(s));
    return () => {
      live = false;
      off();
    };
  }, []);

  if (!state) return null;

  const change = async (c: { enabled?: boolean; afterMinutes?: number }) => {
    setBusy(true);
    const next = await setAppLock(c);
    if (next) setState(next);
    setBusy(false);
  };

  const label = (m: number) =>
    m === 0 ? t("Every time") : m === 60 ? t("1 hour") : t("{n} min", { n: m });

  return (
    <>
      <FieldRow
        label={t("Lock the app")}
        hint={
          state.required ? (
            <p>{t("Your administrator requires the lock.")}</p>
          ) : !state.secure ? (
            <p>{t("This phone has no screen lock. Set one up in the phone's settings to use this.")}</p>
          ) : (
            <p>
              {t("Asks for your fingerprint, face or screen lock when the app is opened. Starting a recording from a notification, the widget or a watch still works while it is locked.")}
            </p>
          )
        }
      >
        <div className="pt-1.5">
          <Switch
            on={state.enabled}
            label={t("Lock the app")}
            disabled={busy || state.required}
            onChange={(on) => void change({ enabled: on })}
          />
        </div>
      </FieldRow>
      {state.enabled ? (
        <FieldRow
          label={t("Lock after")}
          htmlFor="appLockAfter"
          hint={t("How long after leaving the app it asks again when you come back. A restarted phone always asks.")}
        >
          <select
            id="appLockAfter"
            value={String(state.afterMinutes)}
            disabled={busy}
            onChange={(e) => void change({ afterMinutes: Number(e.target.value) })}
            className={`${inputClass} max-w-sm`}
          >
            {MINUTES.map((m) => (
              <option key={m} value={m}>
                {label(m)}
              </option>
            ))}
          </select>
        </FieldRow>
      ) : null}
    </>
  );
}
