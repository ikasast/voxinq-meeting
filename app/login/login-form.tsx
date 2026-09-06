"use client";

import { useState } from "react";

// With accounts, an email address and a password. Without any, the single shared password this app
// asked for before v3.1 — the same field, so an install that has not signed anybody up yet sees
// no change at all.
export function LoginForm({ accounts }: { accounts: boolean }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(accounts ? { email, password } : { password }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        throw new Error(d?.error ?? `HTTP ${res.status}`);
      }
      const next = new URLSearchParams(window.location.search).get("next") || "/";
      // Full reload so the middleware re-evaluates.
      window.location.href = next.startsWith("/") ? next : "/";
      // (full reload above so the middleware re-evaluates)
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-sm py-16">
      <h1 className="mb-4 text-center text-xl font-semibold text-[var(--text-strong)]">Log in</h1>
      <form onSubmit={onSubmit} className="card space-y-4 p-6">
        {accounts ? (
          <div>
            <label htmlFor="email" className="label">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={busy}
              className="input mt-1"
              required
            />
          </div>
        ) : null}
        <div>
          <label htmlFor="password" className="label">
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            autoComplete="current-password"
            className="input mt-1"
          />
        </div>
        {error ? <p className="text-sm text-[var(--error)]">{error}</p> : null}
        <button type="submit" disabled={busy || !password} className="btn-ink w-full">
          {busy ? "Checking…" : "Log in"}
        </button>
      </form>
    </div>
  );
}
