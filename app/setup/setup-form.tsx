"use client";

import { useState } from "react";
import { useT } from "../locale-provider";
import { RecoveryCode } from "../recovery-code";

export function SetupForm() {
  const t = useT();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      setError(t("The two passwords do not match."));
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, email, password, name }),
      });
      const d = (await res.json().catch(() => null)) as {
        error?: string;
        recoveryCode?: string;
      } | null;
      if (!res.ok) throw new Error(d?.error ?? `HTTP ${res.status}`);
      // The account exists and is signed in; the code is shown before going anywhere, because
      // this is the only moment it exists outside the reader's own notes.
      if (d?.recoveryCode) setRecoveryCode(d.recoveryCode);
      else window.location.href = "/";
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  // The heading lives here rather than on the page, because the page becomes a different one
  // when the code appears and "Create the first account" over a recovery code is a leftover.
  if (recoveryCode) {
    return (
      <RecoveryCode
        code={recoveryCode}
        context={t("Your account")}
        onDone={() => (window.location.href = "/")}
      />
    );
  }

  return (
    <>
      <h1 className="mb-1 text-center text-xl font-semibold text-[var(--text-strong)]">
        {t("Create the first account")}
      </h1>
      <p className="mb-4 text-center text-xs text-[var(--text-muted)]">
        {t(
          "It is an administrator. From then on this server asks who you are instead of sharing one password, and APP_PASSWORD stops being a way in.",
        )}
      </p>
      <form onSubmit={onSubmit} className="card space-y-4 p-6">
      <div>
        <label htmlFor="username" className="label">
          {t("Username")}
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
          {t(
            "Letters, numbers, dot, dash, underscore. A short handle — you sign in with your email.",
          )}
        </p>
      </div>
      <div>
        <label htmlFor="email" className="label">
          {t("Email")}
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          autoCapitalize="none"
          autoCorrect="off"
          placeholder="you@example.com"
          className="input mt-1"
          required
        />
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          {t(
            "What you type to sign in. Nothing is ever sent to it — this server has no way to send mail, and does not want one.",
          )}
        </p>
      </div>
      <div>
        <label htmlFor="name" className="label">
          {t("Display name (optional)")}
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
          {t("Password")}
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
          {t("Password again")}
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
      <button type="submit" disabled={busy || !username || !email || !password} className="btn-ink w-full">
        {busy ? t("Creating…") : t("Create the account")}
      </button>
      </form>
    </>
  );
}
