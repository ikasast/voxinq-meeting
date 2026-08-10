"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useConfirm } from "./confirm-dialog";
import { ArchiveIcon, DotsIcon, TrashIcon } from "./icons";

const MENU_W = 176; // matches w-44
const MENU_H = 76; // approx height of the two items
const GAP = 4;
const PAD = 8;

// Per-card "⋯" menu on the meeting list: archive/unarchive and move-to-trash without
// opening the meeting. The dropdown is rendered in a portal and positioned from the button's
// rect, so it is never clipped by the card's overflow (SwipeableRow uses overflow-hidden +
// a transform, which would otherwise cut off the menu on short, tag-less cards).
export function MeetingItemMenu({ id, archived }: { id: string; archived: boolean }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const openMenu = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (r) {
      // Prefer below the button; flip above if it wouldn't fit. Align the right edges.
      let top = r.bottom + GAP;
      if (top + MENU_H > window.innerHeight - PAD) top = r.top - MENU_H - GAP;
      let left = r.right - MENU_W;
      left = Math.max(PAD, Math.min(left, window.innerWidth - MENU_W - PAD));
      setPos({ top, left });
    }
    setOpen(true);
  };

  // The menu is fixed-positioned from the rect at open time; close it if the page moves.
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  const toggleArchive = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/meetings/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: !archived }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setOpen(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const trash = async () => {
    setOpen(false);
    const ok = await confirm({
      title: "Move to Trash?",
      message: "The meeting can be restored from Trash for 30 days.",
      confirmLabel: "Move to Trash",
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/meetings/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const itemClass =
    "flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-[var(--text-secondary)] hover:bg-[var(--hover-surface)] disabled:opacity-50";

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={(e) => {
          e.preventDefault();
          if (open) setOpen(false);
          else openMenu();
        }}
        disabled={busy}
        className="rounded-md p-1 text-[var(--text-muted)] hover:bg-[var(--hover-surface)] hover:text-[var(--foreground)]"
        title="Meeting actions"
        aria-label="Meeting actions"
        aria-expanded={open}
      >
        <DotsIcon className="h-4 w-4" />
      </button>
      {open && pos && typeof document !== "undefined"
        ? createPortal(
            <>
              {/* click-away backdrop */}
              <button
                type="button"
                aria-hidden
                tabIndex={-1}
                onClick={(e) => {
                  e.preventDefault();
                  setOpen(false);
                }}
                className="fixed inset-0 z-40 cursor-default bg-black/30 sm:bg-transparent"
              />
              {/* Fixed, positioned from the button's rect so it can never be clipped by the
                  card's overflow. */}
              <div
                style={{ top: pos.top, left: pos.left, width: MENU_W }}
                className="fixed z-50 overflow-hidden rounded-md border border-[var(--border-strong)] bg-[var(--elevated)] py-1 shadow-lg"
              >
                <button type="button" onClick={() => void toggleArchive()} disabled={busy} className={itemClass}>
                  <ArchiveIcon className="h-3.5 w-3.5" />
                  {archived ? "Unarchive" : "Archive"}
                </button>
                <button type="button" onClick={() => void trash()} disabled={busy} className={`${itemClass} !text-[var(--error)]`}>
                  <TrashIcon className="h-3.5 w-3.5" />
                  Move to Trash
                </button>
              </div>
            </>,
            document.body,
          )
        : null}
    </div>
  );
}
