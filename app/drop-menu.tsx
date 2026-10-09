"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useBackGuard } from "./use-back-guard";

// A small menu that drops from the button that opened it. Drawn in a portal at a fixed position
// worked out from the button, so neither a scrolling panel nor a card's overflow can cut it off;
// it closes when anything scrolls or resizes, on Escape, on Back, and on a click anywhere else.

const GAP = 4;
const PAD = 8;

/** A borderless icon button: the one that opens a menu, and the ones beside it. */
export const ICON_BUTTON =
  "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--hover-surface)] hover:text-[var(--foreground)] disabled:opacity-50";

/** A row in the menu. */
export const MENU_ITEM =
  "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-[var(--text-secondary)] hover:bg-[var(--hover-surface)] hover:text-[var(--foreground)] disabled:opacity-50 disabled:hover:bg-transparent";

/** A rule between groups of rows. */
export function MenuRule() {
  return <div role="separator" className="my-1 border-t border-[var(--border)]" />;
}

export function DropMenu({
  label,
  ariaLabel,
  className,
  trigger,
  width = 208,
  align = "end",
  children,
}: {
  /** What the button does: its tooltip, and its accessible name unless `ariaLabel` says otherwise. */
  label: string;
  ariaLabel?: string;
  className: string;
  trigger: ReactNode;
  width?: number;
  /** Which edge of the button the menu lines up with. */
  align?: "start" | "end";
  /** `close` resolves once the menu's Back entry is gone: await it before navigating or opening
   *  a dialog, or that Back lands after and undoes it. */
  children: (close: () => Promise<void>) => ReactNode;
}) {
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const release = useBackGuard(pos !== null, () => setPos(null));
  const close = () => {
    setPos(null);
    return release();
  };

  const open = () => {
    const r = button.current?.getBoundingClientRect();
    if (!r) return;
    const left = align === "end" ? r.right - width : r.left;
    setPos({ top: r.bottom + GAP, left: Math.max(PAD, Math.min(left, window.innerWidth - width - PAD)) });
  };

  // Above the button instead, when there is no room below it.
  useLayoutEffect(() => {
    const r = button.current?.getBoundingClientRect();
    const h = menu.current?.offsetHeight ?? 0;
    if (!pos || !r || pos.top < r.bottom) return;
    if (pos.top + h > window.innerHeight - PAD && r.top - h - GAP > PAD) setPos({ ...pos, top: r.top - h - GAP });
  }, [pos]);

  useEffect(() => {
    if (!pos) return;
    const shut = () => setPos(null);
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setPos(null);
      button.current?.focus();
    };
    window.addEventListener("scroll", shut, true);
    window.addEventListener("resize", shut);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("scroll", shut, true);
      window.removeEventListener("resize", shut);
      window.removeEventListener("keydown", key);
    };
  }, [pos]);

  return (
    <>
      <button
        ref={button}
        type="button"
        onClick={() => (pos ? void close() : open())}
        title={label}
        aria-label={ariaLabel ?? label}
        aria-haspopup="menu"
        aria-expanded={pos !== null}
        className={className}
      >
        {trigger}
      </button>
      {pos
        ? createPortal(
            <>
              <div aria-hidden className="fixed inset-0 z-40" onClick={() => void close()} />
              <div
                ref={menu}
                role="menu"
                style={{ top: pos.top, left: pos.left, width }}
                className="fixed z-50 overflow-hidden rounded-lg border border-[var(--border-strong)] bg-[var(--elevated)] py-1 shadow-lg"
              >
                {children(close)}
              </div>
            </>,
            window.document.body,
          )
        : null}
    </>
  );
}
