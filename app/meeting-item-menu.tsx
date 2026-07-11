"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useConfirm } from "./confirm-dialog";
import { ArchiveIcon, DotsIcon, TrashIcon } from "./icons";

// Per-card "⋯" menu on the meeting list: archive/unarchive and move-to-trash without
// opening the meeting. Positioned absolutely over the card link, so clicks must not
// bubble into the navigation.
export function MeetingItemMenu({ id, archived }: { id: string; archived: boolean }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

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
        type="button"
        onClick={(e) => {
          e.preventDefault();
          setOpen((v) => !v);
        }}
        disabled={busy}
        className="rounded-md p-1 text-[var(--text-muted)] hover:bg-[var(--hover-surface)] hover:text-[var(--foreground)]"
        title="Meeting actions"
        aria-label="Meeting actions"
        aria-expanded={open}
      >
        <DotsIcon className="h-4 w-4" />
      </button>
      {open ? (
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
            className="fixed inset-0 z-10 cursor-default"
          />
          <div className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-md border border-[var(--border-strong)] bg-[var(--elevated)] py-1 shadow-lg">
            <button type="button" onClick={() => void toggleArchive()} disabled={busy} className={itemClass}>
              <ArchiveIcon className="h-3.5 w-3.5" />
              {archived ? "Unarchive" : "Archive"}
            </button>
            <button type="button" onClick={() => void trash()} disabled={busy} className={`${itemClass} !text-[var(--error)]`}>
              <TrashIcon className="h-3.5 w-3.5" />
              Move to Trash
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
