"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useRef, useState } from "react";
import { useConfirm } from "./confirm-dialog";
import { ArchiveIcon, RestoreIcon, TrashIcon } from "./icons";

// Distance (px) the row must travel before the gesture commits on release.
const COMMIT_PX = 96;
// Horizontal movement must clearly beat vertical movement, otherwise it is a scroll.
const DIRECTION_LOCK_PX = 12;

type Props = {
  ids: string[]; // one meeting, or every meeting of a collapsed series stack
  label: string; // shown in the delete confirmation
  archived?: boolean; // archived rows swipe right to UNarchive
  children: ReactNode;
};

// Gmail-style swipe actions for touch devices: swipe right to archive (or unarchive),
// swipe left to move to Trash. Mouse input is untouched — this only binds touch events,
// so the desktop two-pane UI keeps its normal click behaviour.
export function SwipeableRow({ ids, label, archived = false, children }: Props) {
  const router = useRouter();
  const confirm = useConfirm();
  const [dx, setDx] = useState(0);
  const [busy, setBusy] = useState(false);
  const [gone, setGone] = useState(false);

  const startX = useRef(0);
  const startY = useRef(0);
  const axis = useRef<"none" | "x" | "y">("none");
  // Mirrors dx synchronously: on a fast flick touchmove and touchend land in the same
  // React batch, so reading the state in touchend can still see the pre-move value.
  const dxRef = useRef(0);

  const many = ids.length > 1;

  const run = async (action: "archive" | "unarchive" | "trash") => {
    if (action === "trash") {
      const ok = await confirm({
        title: many ? `${ids.length} meetings — ${label}` : label,
        message: many
          ? `Move all ${ids.length} meetings in this series to Trash. You can restore them within 30 days.`
          : "Move this meeting to Trash. You can restore it within 30 days.",
        confirmLabel: "Move to Trash",
        danger: true,
      });
      if (!ok) {
        setDx(0);
        return;
      }
    }
    setBusy(true);
    try {
      const res = await fetch("/api/meetings/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, action }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // Slide the row out, then let the server component re-render without it.
      setGone(true);
      router.refresh();
    } catch {
      setDx(0);
      setBusy(false);
    }
  };

  const onTouchStart = (e: React.TouchEvent) => {
    if (busy || gone) return;
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    axis.current = "none";
    dxRef.current = 0;
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (busy || gone) return;
    const moveX = e.touches[0].clientX - startX.current;
    const moveY = e.touches[0].clientY - startY.current;
    if (axis.current === "none") {
      if (Math.abs(moveX) < DIRECTION_LOCK_PX && Math.abs(moveY) < DIRECTION_LOCK_PX) return;
      // Lock to whichever direction the finger committed to first.
      axis.current = Math.abs(moveX) > Math.abs(moveY) ? "x" : "y";
    }
    if (axis.current !== "x") return;
    // Rubber-band past the commit point so the gesture still feels bounded.
    const capped = Math.sign(moveX) * Math.min(Math.abs(moveX), COMMIT_PX * 1.6);
    dxRef.current = capped;
    setDx(capped);
  };

  const onTouchEnd = () => {
    if (busy || gone) return;
    const moved = dxRef.current;
    dxRef.current = 0;
    setDx(0);
    if (axis.current !== "x" || Math.abs(moved) < COMMIT_PX) return;
    void run(moved > 0 ? (archived ? "unarchive" : "archive") : "trash");
  };

  const revealing = dx !== 0;
  const rightward = dx > 0;

  return (
    <div
      className={`relative overflow-hidden rounded-lg transition-[max-height,opacity] ${
        gone ? "pointer-events-none max-h-0 opacity-0" : "max-h-[600px] opacity-100"
      }`}
    >
      {/* Action backdrop revealed under the row while swiping */}
      {revealing ? (
        <div
          aria-hidden
          className={`absolute inset-0 flex items-center rounded-lg px-4 text-sm font-medium ${
            rightward
              ? "justify-start bg-[color-mix(in_srgb,var(--accent)_28%,transparent)] text-[var(--accent-sub)]"
              : "justify-end bg-[color-mix(in_srgb,var(--error)_28%,transparent)] text-[var(--error)]"
          }`}
        >
          <span className="inline-flex items-center gap-1.5">
            {rightward ? (
              <>
                {archived ? <RestoreIcon className="h-4 w-4" /> : <ArchiveIcon className="h-4 w-4" />}
                {archived ? "Unarchive" : "Archive"}
                {many ? ` series (${ids.length})` : ""}
              </>
            ) : (
              <>
                <TrashIcon className="h-4 w-4" />
                Trash{many ? ` series (${ids.length})` : ""}
              </>
            )}
          </span>
        </div>
      ) : null}

      <div
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
        // pan-y keeps vertical scrolling native while we own horizontal movement.
        style={{ transform: `translateX(${dx}px)`, touchAction: "pan-y" }}
        className={`relative ${dx === 0 ? "transition-transform duration-200" : ""} ${
          busy ? "opacity-60" : ""
        }`}
      >
        {children}
      </div>
    </div>
  );
}
