"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useT } from "./locale-provider";
import { useBackGuard } from "./use-back-guard";

export type ConfirmOptions = {
  title?: string; // dialog heading (e.g. meeting title). Unlike the browser default, no origin name is shown.
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean; // make the confirm button red for destructive actions
  alertOnly?: boolean; // notice only (no cancel)
  checkboxLabel?: string; // an accompanying option (e.g. protect the recording)
  checkboxDefault?: boolean;
};

export type ConfirmResult = { ok: boolean; checked: boolean };

const ConfirmContext = createContext<(o: ConfirmOptions) => Promise<ConfirmResult>>(async () => ({
  ok: false,
  checked: false,
}));

/** Confirmation with a checkbox. Returns { ok, checked }. */
export const useConfirmEx = () => useContext(ConfirmContext);

/** Backward-compatible confirmation (returns a boolean). */
export const useConfirm = () => {
  const confirmEx = useContext(ConfirmContext);
  return useCallback(async (o: ConfirmOptions) => (await confirmEx(o)).ok, [confirmEx]);
};

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const t = useT();
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const [checked, setChecked] = useState(false);
  const resolver = useRef<((v: ConfirmResult) => void) | null>(null);
  const checkedRef = useRef(false);

  const confirm = useCallback((o: ConfirmOptions) => {
    return new Promise<ConfirmResult>((resolve) => {
      resolver.current = resolve;
      checkedRef.current = Boolean(o.checkboxDefault);
      setChecked(Boolean(o.checkboxDefault));
      setOpts(o);
    });
  }, []);

  // Back cancels, as it closes any dialog on a phone. Through a ref: finish needs the release
  // this returns, and Back needs finish.
  const finishRef = useRef<(v: boolean) => void>(() => {});
  const releaseBack = useBackGuard(opts !== null, () => finishRef.current(false));

  // The answer goes back only once the dialog's history entry is gone: what the caller does next
  // is often to navigate, and a navigation that lands before that Back would be undone by it.
  const finish = useCallback(
    (v: boolean) => {
      setOpts(null);
      const resolve = resolver.current;
      resolver.current = null;
      const checkedNow = checkedRef.current;
      void releaseBack().then(() => resolve?.({ ok: v, checked: checkedNow }));
    },
    [releaseBack],
  );
  useEffect(() => {
    finishRef.current = finish;
  }, [finish]);

  useEffect(() => {
    if (!opts) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish(false);
      if (e.key === "Enter") finish(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [opts, finish]);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {opts ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => finish(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="card w-full max-w-sm p-5"
            onClick={(e) => e.stopPropagation()}
          >
            {opts.title ? (
              <h2 className="section-title text-base font-semibold text-[var(--text-strong)]">
                {opts.title}
              </h2>
            ) : null}
            <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--text-secondary)]">
              {opts.message}
            </p>
            {opts.checkboxLabel ? (
              <label className="mt-4 flex items-start gap-2 text-sm text-[var(--text-secondary)]">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => {
                    setChecked(e.target.checked);
                    checkedRef.current = e.target.checked;
                  }}
                  className="mt-0.5 accent-[var(--accent)]"
                />
                {opts.checkboxLabel}
              </label>
            ) : null}
            <div className="mt-5 flex justify-end gap-2">
              {opts.alertOnly ? null : (
                <button type="button" className="btn-soft" onClick={() => finish(false)}>
                  {opts.cancelLabel ?? t("Cancel")}
                </button>
              )}
              <button
                type="button"
                autoFocus
                onClick={() => finish(true)}
                className={
                  opts.danger
                    ? "btn-danger"
                    : "btn-ink"
                }
              >
                {opts.confirmLabel ?? t("OK")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </ConfirmContext.Provider>
  );
}
