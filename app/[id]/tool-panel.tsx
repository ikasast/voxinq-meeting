"use client";

import { useT } from "@/app/locale-provider";
import { CheckIcon, CloseIcon } from "../icons";
import { ROW_BUTTON } from "./transcript-buttons";

/** One step of speaker separation: done, the next to do, or not yet reachable. */
export type StepState = "done" | "next" | "later";

export function Step({ n, state, title, children }: { n: number; state: StepState; title: string; children: React.ReactNode }) {
  const t = useT();
  return (
    <li className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-x-2.5">
      <span
        aria-label={state === "done" ? t("Done") : undefined}
        className={`mt-0.5 flex h-5 w-5 items-center justify-center rounded-full border text-[11px] font-medium ${
          state === "done"
            ? "border-[color-mix(in_srgb,var(--success)_50%,transparent)] bg-[color-mix(in_srgb,var(--success)_14%,transparent)] text-[var(--success)]"
            : state === "next"
              ? "border-[var(--btn-primary-border)] bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)]"
              : "border-[var(--border-strong)] text-[var(--text-muted)]"
        }`}
      >
        {state === "done" ? <CheckIcon className="h-3 w-3" /> : n}
      </span>
      <div className={state === "later" ? "opacity-60" : ""}>
        <p className="mb-1.5 text-sm font-medium text-[var(--text-strong)]">{title}</p>
        {children}
      </div>
    </li>
  );
}

/**
 * What one of the tools above the lines opens: right under them, with a rule above and below and
 * nothing boxed inside — a fold, not another card.
 */
export function ToolPanel({
  title,
  hint,
  onClose,
  children,
}: {
  title: string;
  hint: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const t = useT();
  return (
    <div className="mt-2 border-y border-[var(--border)] py-3">
      <div className="mb-3 flex items-start gap-2">
        <p className="min-w-0 flex-1 text-sm font-medium text-[var(--text-strong)]">
          {title}
          <span className="ml-2 text-xs font-normal text-[var(--text-muted)]">{hint}</span>
        </p>
        <button type="button" onClick={onClose} title={t("Close")} aria-label={t("Close")} className={ROW_BUTTON}>
          <CloseIcon className="h-3.5 w-3.5" />
        </button>
      </div>
      {children}
    </div>
  );
}
