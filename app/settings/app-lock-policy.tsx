"use client";

import { useEffect, useState } from "react";
import { useT } from "@/app/locale-provider";
import { Switch } from "@/app/switch";

// Settings → Defaults for everyone: whether every phone's app must be locked (/api/app-lock).
//
// Not one of the defaults above it. Those are where people start and may leave; this is a rule
// nobody leaves, so it is saved as it is flipped rather than with them. And it is kept by the
// app, not checked by the server — the note says so, because an administrator relying on it
// should know what it does not cover.

export function AppLockPolicy() {
  const t = useT();
  const [required, setRequired] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/app-lock", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<{ required: boolean }>) : null))
      .then((d) => setRequired(d?.required ?? false))
      .catch(() => setRequired(false));
  }, []);

  const change = async (on: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/app-lock", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ required: on }),
      });
      const d = (await res.json().catch(() => null)) as { required?: boolean; error?: string } | null;
      if (!res.ok) throw new Error(d?.error ?? `HTTP ${res.status}`);
      setRequired(d?.required ?? on);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (required === null) return null;

  return (
    <section className="mt-8 space-y-2 border-t border-[var(--border)] pt-6">
      <h3 className="text-sm font-medium text-[var(--text-primary)]">{t("Android app")}</h3>
      <div className="flex items-center justify-between gap-4">
        <span className="text-sm text-[var(--text-secondary)]">{t("Require the app lock")}</span>
        <Switch on={required} label={t("Require the app lock")} disabled={busy} onChange={(on) => void change(on)} />
      </div>
      <p className="text-xs text-[var(--text-muted)]">
        {t("Every phone asks for its fingerprint, face or screen lock the next time the app is opened, and the lock cannot be turned off there. A phone with no screen lock shows nothing until it has one. Starting a recording is not stopped. How long an unlock lasts is still each person's choice.")}
      </p>
      <p className="text-xs text-[var(--text-muted)]">
        {t("The app keeps this rule; the server cannot check that it does. An app older than this version opens as before.")}
      </p>
      {error ? <p className="text-sm text-[var(--error)]">{error}</p> : null}
    </section>
  );
}
