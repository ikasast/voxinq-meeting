"use client";

import { useState } from "react";

export function SetupForm() {
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      setError("The two passwords do not match.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, name }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(d?.error ?? `HTTP ${res.status}`);
      }
      window.location.href = "/";
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="card space-y-4 p-6">
      <div>
        <label htmlFor="username" className="label">
          Username
        </label>
        <input
          id="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          autoFocus
          className="input mt-1"
          required
        />
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          Letters, numbers, dot, dash, underscore. This is what you type to sign in.
        </p>
      </div>
      <div>
        <label htmlFor="name" className="label">
          Display name (optional)
        </label>
        <input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="input mt-1"
        />
      </div>
      <div>
        <label htmlFor="password" className="label">
          Password
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          className="input mt-1"
          required
        />
      </div>
      <div>
        <label htmlFor="confirm" className="label">
          Password again
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
      <button type="submit" disabled={busy || !username || !password} className="btn-ink w-full">
        {busy ? "Creating…" : "Create the account"}
      </button>
    </form>
  );
}
