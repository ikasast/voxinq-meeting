"use client";

import { useState } from "react";
import { RecoveryCode } from "../recovery-code";

export function AccountForm({ hasPassword }: { hasPassword: boolean }) {
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      setError("The two passwords do not match.");
      return;
    }
    setError(null);
    setMsg(null);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current, password }),
      });
      const d = (await res.json().catch(() => null)) as {
        error?: string;
        recoveryCode?: string;
      } | null;
      if (!res.ok) throw new Error(d?.error ?? `HTTP ${res.status}`);
      // A first password is also this account's first key, and the code that goes with it is
      // shown once — here, before anything else on the screen matters.
      if (d?.recoveryCode) {
        setRecoveryCode(d.recoveryCode);
        return;
      }
      setMsg("Saved. You can now sign in from anywhere with it.");
      setCurrent("");
      setPassword("");
      setConfirm("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const signOutEverywhere = async () => {
    setBusy(true);
    try {
      await fetch("/api/auth/password", { method: "DELETE" });
      window.location.href = "/login";
    } catch {
      setBusy(false);
    }
  };

  if (recoveryCode) {
    return (
      <RecoveryCode
        code={recoveryCode}
        context="Your account"
        onDone={() => window.location.reload()}
      />
    );
  }

  return (
    <div className="space-y-4">
      <form onSubmit={save} className="card space-y-3 p-4">
        <h2 className="text-sm font-medium text-[var(--text-strong)]">
          {hasPassword ? "Change your password" : "Set a password"}
        </h2>
        {!hasPassword ? (
          <p className="text-xs text-[var(--text-muted)]">
            Your account was made from your tailnet login, so it has no password — inside the
            tailnet you are never asked for one. Set one to be able to sign in from anywhere
            else.
          </p>
        ) : null}
        {hasPassword ? (
          <div>
            <label htmlFor="current" className="label">
              Current password
            </label>
            <input
              id="current"
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              autoComplete="current-password"
              className="input mt-1"
              required
            />
          </div>
        ) : null}
        <div>
          <label htmlFor="new" className="label">
            New password
          </label>
          <input
            id="new"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            className="input mt-1"
            required
          />
        </div>
        <div>
          <label htmlFor="again" className="label">
            New password again
          </label>
          <input
            id="again"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            className="input mt-1"
            required
          />
        </div>
        {error ? <p className="text-sm text-[var(--error)]">{error}</p> : null}
        {msg ? <p className="text-sm text-[var(--accent-sub)]">{msg}</p> : null}
        <button type="submit" disabled={busy || !password} className="btn-ink">
          {busy ? "Saving…" : "Save"}
        </button>
      </form>

      <div className="card space-y-2 p-4">
        <h2 className="text-sm font-medium text-[var(--text-strong)]">Signed-in devices</h2>
        <p className="text-xs text-[var(--text-muted)]">
          Ends every session, including this one. Use it for a phone you no longer have — the
          sessions live on the server, so this takes effect at once rather than whenever the
          browser next asks.
        </p>
        <button type="button" onClick={signOutEverywhere} disabled={busy} className="btn-outline">
          Sign out everywhere
        </button>
      </div>
    </div>
  );
}
