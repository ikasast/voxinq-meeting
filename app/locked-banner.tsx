"use client";

import { useState } from "react";
import { useT } from "./locale-provider";

// What a locked archive should look like, instead of what it looked like.
//
// Everything of this account's was encrypted and its key was closed, so every transcript on
// every page read `🔒 encrypted` — the string, in place of the words — and nothing anywhere
// said why or what to do. Somebody would reasonably conclude their meetings were gone.
//
// The key is opened by a secret, and inside a tailnet nobody is ever asked for one: the identity
// header settles *who*, and carries nothing that opens data. So the app has to ask, once, in the
// place where the absence shows.
export function LockedBanner() {
  const t = useT();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const unlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const d = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(d?.error ?? `HTTP ${res.status}`);
      // A full reload rather than a router refresh: what changed is not this page's data but
      // whether *any* page can read anything, and every server component on screen was rendered
      // against the locked answer.
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("Could not unlock"));
      setBusy(false);
    }
  };

  return (
    <div className="border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]">
      <form
        onSubmit={unlock}
        className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3"
      >
        <p className="text-sm text-[var(--text-secondary)]">
          <span className="font-medium text-[var(--text-strong)]">
            {t("Your meetings are locked.")}
          </span>{" "}
          {t("Transcripts and minutes are encrypted with a key only your password opens.")}
        </p>
        <label htmlFor="unlock" className="sr-only">
          {t("Password")}
        </label>
        <input
          id="unlock"
          type="password"
          autoComplete="current-password"
          placeholder={t("Password")}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={busy}
          className="input h-9 w-48"
          required
        />
        <button type="submit" disabled={busy || !password} className="btn-ink h-9">
          {busy ? t("Unlocking…") : t("Unlock")}
        </button>
        {error ? <span className="text-sm text-[var(--error)]">{error}</span> : null}
      </form>
    </div>
  );
}
