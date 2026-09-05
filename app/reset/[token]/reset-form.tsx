"use client";

import { useState } from "react";
import { useConfirm } from "../../confirm-dialog";
import { RecoveryCode } from "../../recovery-code";

// Setting a password from a one-time link.
//
// Three things can happen, and only the first is ordinary. An account with no key just gets a
// new password. An account with one is asked for its recovery code, because a new password
// alone would leave meetings that can never be read again. And somebody who no longer has the
// code can say so — deliberately, twice — and start over with nothing.

export function ResetForm({ token }: { token: string }) {
  const confirm = useConfirm();
  const [password, setPassword] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [enteredCode, setEnteredCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The server has told us this account has encrypted meetings. */
  const [needsCode, setNeedsCode] = useState(false);
  const [newCode, setNewCode] = useState<string | null>(null);

  const post = async (startOver: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          password,
          recoveryCode: enteredCode || undefined,
          startOver: startOver || undefined,
        }),
      });
      const d = (await res.json().catch(() => null)) as {
        error?: string;
        needsRecoveryCode?: boolean;
        recoveryCode?: string;
      } | null;
      if (!res.ok) {
        if (d?.needsRecoveryCode) {
          setNeedsCode(true);
          return;
        }
        throw new Error(d?.error ?? `HTTP ${res.status}`);
      }
      // Starting over mints a new key, and its code is shown once before going anywhere.
      if (d?.recoveryCode) {
        setNewCode(d.recoveryCode);
        return;
      }
      window.location.href = "/";
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPw) {
      setError("The two passwords do not match.");
      return;
    }
    await post(false);
  };

  const startOver = async () => {
    const ok = await confirm({
      title: "Start again without your old meetings?",
      message:
        "Everything already recorded on this account is encrypted with a key only your recovery" +
        " code opens. Without it, those meetings can never be read again — not by you, not by an" +
        " administrator.\n\nThey stay on the disk and stay unreadable. Anything recorded from" +
        " now on will be fine.",
      confirmLabel: "Start again — I accept losing them",
      cancelLabel: "Go back",
      danger: true,
    });
    if (ok) await post(true);
  };

  if (newCode) {
    return (
      <RecoveryCode
        code={newCode}
        context="Your account has a new key, and"
        onDone={() => (window.location.href = "/")}
      />
    );
  }

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
          value={confirmPw}
          onChange={(e) => setConfirmPw(e.target.value)}
          autoComplete="new-password"
          className="input mt-1"
          required
        />
      </div>

      {needsCode ? (
        <div className="space-y-2 rounded-md border border-[color-mix(in_srgb,var(--warning)_45%,transparent)] bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] p-3">
          <p className="text-xs text-[var(--text-secondary)]">
            This account has encrypted meetings. Enter the recovery code you were given when the
            account was set up, and everything stays as it is.
          </p>
          <input
            id="recoveryCode"
            value={enteredCode}
            onChange={(e) => setEnteredCode(e.target.value)}
            placeholder="XXXXX-XXXXX-XXXXX-XXXXX"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            className="input font-mono"
          />
          <button
            type="button"
            onClick={() => void startOver()}
            disabled={busy}
            className="text-xs text-[var(--text-muted)] underline"
          >
            I do not have it
          </button>
        </div>
      ) : null}

      {error ? <p className="text-sm text-[var(--error)]">{error}</p> : null}
      <button type="submit" disabled={busy || !password} className="btn-ink w-full">
        {busy ? "Setting…" : "Set the password and sign in"}
      </button>
    </form>
  );
}
