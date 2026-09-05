"use client";

import { useRef, useState } from "react";
import { useConfirm } from "./confirm-dialog";

// The one screen where skimming costs somebody their meetings.
//
// The recovery code is the only thing that opens an account's data when the password is gone.
// It is not stored anywhere — not by the server, not by an administrator — so this is genuinely
// the last time it exists outside of wherever the reader puts it.
//
// Which makes the design job unusual: everything here is arranged to slow somebody down. The
// code is large and monospaced so it can be read off a screen and typed onto paper. Copying is
// one tap, because a person who has to select four groups of characters by hand is a person who
// will decide it does not matter. And moving on asks once more, in a dialog, because "I will
// save it in a minute" is the exact thought this has to interrupt.

export function RecoveryCode({
  code,
  onDone,
  context = "This account",
}: {
  code: string;
  /** What happens once they have confirmed they have it. */
  onDone: () => void;
  context?: string;
}) {
  const confirm = useConfirm();
  const [copied, setCopied] = useState<"yes" | "no" | null>(null);
  const codeRef = useRef<HTMLParagraphElement>(null);

  /**
   * Copy, three ways.
   *
   * `navigator.clipboard` does not exist outside a secure context, and this app is routinely
   * reached over plain http on a home network — so on the very deployment least likely to have
   * a password manager, the modern API is the one that is missing. `execCommand` is deprecated
   * and works there. If both fail the text is selected instead, so the reader is one keystroke
   * away rather than being told nothing happened.
   */
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied("yes");
      setTimeout(() => setCopied(null), 2500);
      return;
    } catch {
      // Fall through: refused, or absent because this is not a secure context.
    }
    const selected = selectCode(codeRef.current);
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    setCopied(ok ? "yes" : "no");
    // Left selected on failure, which is what makes "copy it yourself" a single keystroke.
    if (ok && selected) window.getSelection()?.removeAllRanges();
    setTimeout(() => setCopied(null), 4000);
  };

  const moveOn = async () => {
    const ok = await confirm({
      title: "Have you saved your recovery code?",
      message:
        "It cannot be shown again. Nobody can produce it later — not an administrator, not the" +
        " server, not by resetting your password.\n\nWithout it, forgetting your password means" +
        " the meetings on this account stay encrypted and cannot be read.",
      confirmLabel: "Yes, I have saved it",
      cancelLabel: "Not yet",
      danger: true,
    });
    if (ok) onDone();
  };

  return (
    <div className="space-y-4">
      <h1 className="text-center text-xl font-semibold text-[var(--text-strong)]">
        Your recovery code
      </h1>
      <div className="rounded-lg border border-[color-mix(in_srgb,var(--warning)_50%,transparent)] bg-[color-mix(in_srgb,var(--warning)_12%,transparent)] p-4">
        <h2 className="text-sm font-semibold text-[var(--warning)]">
          Save this now — it is never shown again
        </h2>
        <p className="mt-1 text-xs text-[var(--text-secondary)]">
          {context} is encrypted. This code is the only way back in if you forget your password.
          It is not stored anywhere: an administrator can send you a link to set a new password,
          and without this code that new password opens an account whose meetings can no longer
          be read.
        </p>
      </div>

      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 text-center">
        <p
          ref={codeRef}
          className="select-all break-all font-mono text-xl font-semibold tracking-[0.15em] text-[var(--text-strong)]"
          aria-label={`Recovery code ${code.split("").join(" ")}`}
        >
          {code}
        </p>
        <button type="button" onClick={() => void copy()} className="btn-outline mt-3 !px-4">
          {copied === "yes" ? "Copied" : "Copy"}
        </button>
        {copied === "no" ? (
          <p className="mt-2 text-xs text-[var(--warning)]">
            This browser would not let the page copy for you — the code is selected, so press
            {" "}
            <kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>C</kbd>.
          </p>
        ) : null}
      </div>

      <ul className="list-disc space-y-1 pl-5 text-xs text-[var(--text-muted)]">
        <li>A password manager is the right place for it.</li>
        <li>On paper is fine too — the characters avoid anything that can be misread.</li>
        <li>Anybody holding it can decrypt this account, so treat it as the password itself.</li>
      </ul>

      <button type="button" onClick={() => void moveOn()} className="btn-ink w-full">
        I have saved it — continue
      </button>
    </div>
  );
}

/** Put the code in the selection, so a manual copy is one keystroke. */
function selectCode(el: HTMLElement | null): boolean {
  if (!el) return false;
  const range = document.createRange();
  range.selectNodeContents(el);
  const sel = window.getSelection();
  if (!sel) return false;
  sel.removeAllRanges();
  sel.addRange(range);
  return true;
}
