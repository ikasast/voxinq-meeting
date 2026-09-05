"use client";

import { useState } from "react";

export function ResetForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      setError("The two passwords do not match.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const d = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(d?.error ?? `HTTP ${res.status}`);
      window.location.href = "/";
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="card space-y-4 p-6">
      <div>
        <label htmlFor="password" className="label">
          New password
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          autoFocus
          className="input mt-1"
          required
        />
      </div>
      <div>
        <label htmlFor="confirm" className="label">
          New password again
        </label>
        <input
          id="confirm"
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          className="input mt-1"
          required
        />
      </div>
      {error ? <p className="text-sm text-[var(--error)]">{error}</p> : null}
      <button type="submit" disabled={busy || !password} className="btn-ink w-full">
        {busy ? "Setting…" : "Set the password and sign in"}
      </button>
    </form>
  );
}
