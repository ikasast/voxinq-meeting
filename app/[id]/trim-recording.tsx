"use client";

import { type RefObject, useCallback, useEffect, useRef, useState } from "react";
import { formatOffset } from "@/lib/utils";
import { useConfirm } from "../confirm-dialog";
import { ScissorsIcon } from "../icons";
import { useT } from "@/app/locale-provider";

// Cutting a recording down to the part that was the meeting.
//
// For the meeting left recording after it ended: hours of a quiet room, and whatever the
// recogniser made of it scattered through the transcript. Deleting those lines one at a time is
// fine for a minute too many, not for seven hours. Two handles on a bar choose what to keep; the
// lines are drawn on the bar as ticks, so where the meeting really ended is usually visible at a
// glance, and the player beside it is how to check.
//
// What is outside the range — audio and lines — is deleted for good (app/api/meetings/[id]/trim).

type Handle = "start" | "end";

export function TrimRecording({
  meetingId,
  durationSec,
  linePositions,
  audioRef,
}: {
  meetingId: string;
  durationSec: number;
  /** Where each line starts in the recording, in seconds. */
  linePositions: number[];
  audioRef: RefObject<HTMLAudioElement | null>;
}) {
  const t = useT();
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState(0);
  const [chosenEnd, setEnd] = useState(durationSec);
  const [playhead, setPlayhead] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<Handle | null>(null);

  // Read within the recording as it is now, in case it changed length since the page loaded.
  const end = chosenEnd > durationSec || chosenEnd === 0 ? durationSec : chosenEnd;

  useEffect(() => {
    const el = audioRef.current;
    if (!el || !open) return;
    const follow = () => setPlayhead(el.currentTime);
    el.addEventListener("timeupdate", follow);
    return () => el.removeEventListener("timeupdate", follow);
  }, [audioRef, open]);

  const at = useCallback(
    (clientX: number) => {
      const rect = barRef.current?.getBoundingClientRect();
      if (!rect || rect.width === 0) return 0;
      return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)) * durationSec;
    },
    [durationSec],
  );

  // Never closer than a second: the server refuses to keep less, and two handles on top of each
  // other cannot be told apart to pick up again.
  const place = useCallback(
    (handle: Handle, seconds: number) => {
      const s = Math.round(seconds);
      if (handle === "start") setStart(Math.max(0, Math.min(s, end - 1)));
      else setEnd(Math.min(durationSec, Math.max(s, start + 1)));
    },
    [start, end, durationSec],
  );

  const seek = (seconds: number) => {
    const el = audioRef.current;
    if (!el) return;
    el.currentTime = Math.max(0, seconds);
    void el.play().catch(() => {});
  };

  const pct = (seconds: number) => `${(Math.min(Math.max(seconds, 0), durationSec) / durationSec) * 100}%`;

  const trim = async () => {
    setError(null);
    setBusy(true);
    const range = { startMs: Math.round(start * 1000), endMs: Math.round(end * 1000) };
    let giveBack: (() => void) | null = null;
    try {
      const preview = await fetch(`/api/meetings/${meetingId}/trim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...range, dryRun: true }),
      });
      const counted = (await preview.json().catch(() => null)) as { removed?: number; error?: string } | null;
      if (!preview.ok || typeof counted?.removed !== "number") {
        throw new Error(counted?.error ?? `HTTP ${preview.status}`);
      }
      const ok = await confirm({
        title: t("Trim the recording?"),
        message: t(
          "Only {from}–{to} is kept. The rest of the audio and {n} lines outside it are deleted, and this cannot be undone. Existing minutes are not rewritten, and speaker separation will need to be run again.",
          { from: formatOffset(start), to: formatOffset(end), n: counted.removed },
        ),
        confirmLabel: t("Trim"),
        danger: true,
      });
      if (!ok) return;
      // The player still has the recording open, and on Windows an open file cannot be replaced:
      // let go of it first, and take it back if the trim does not happen.
      const el = audioRef.current;
      const src = el?.getAttribute("src");
      if (el && src) {
        el.pause();
        el.removeAttribute("src");
        el.load();
        giveBack = () => {
          el.setAttribute("src", src);
          el.load();
        };
      }
      const res = await fetch(`/api/meetings/${meetingId}/trim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(range),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(d?.error ?? `HTTP ${res.status}`);
      }
      // The audio, every line's position and the meeting's times all changed: start over.
      window.location.reload();
    } catch (e) {
      giveBack?.();
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("Trim the recording…")}
        title={t("Trim the recording…")}
        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-[var(--text-muted)] hover:bg-[var(--hover-surface)] hover:text-[var(--foreground)]"
      >
        <ScissorsIcon className="h-3.5 w-3.5" />
      </button>
    );
  }

  const handle = (which: Handle, seconds: number, label: string) => (
    <div
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={Math.round(durationSec)}
      aria-valuenow={Math.round(seconds)}
      aria-valuetext={formatOffset(seconds)}
      onPointerDown={(e) => {
        e.stopPropagation();
        dragging.current = which;
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (dragging.current === which) place(which, at(e.clientX));
      }}
      onPointerUp={() => {
        dragging.current = null;
      }}
      // Letting go of a handle is not a click on the bar: it should not jump the player there.
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 60 : 1;
        if (e.key === "ArrowLeft") place(which, seconds - step);
        else if (e.key === "ArrowRight") place(which, seconds + step);
        else return;
        e.preventDefault();
      }}
      style={{ left: pct(seconds) }}
      className="absolute top-0 z-10 h-full w-3 -translate-x-1/2 cursor-ew-resize touch-none rounded-sm bg-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
    />
  );

  return (
    <div className="mt-2 w-full border-y border-[var(--border)] py-3">
      <p className="text-sm font-medium text-[var(--text-strong)]">{t("Trim the recording")}</p>
      <p className="mt-1 text-xs text-[var(--text-muted)]">
        {t(
          "Drag the two handles to the part to keep. Each tick is a line of the transcript; click the bar to listen from there. Audio and lines outside the range are deleted for good.",
        )}
      </p>

      <div
        ref={barRef}
        onClick={(e) => seek(at(e.clientX))}
        className="relative mt-3 h-10 cursor-pointer select-none overflow-hidden rounded border border-[var(--border-strong)] bg-[var(--elevated)]"
      >
        {/* The lines, so the end of the talking is visible. */}
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 1000 40" preserveAspectRatio="none" aria-hidden="true">
          {linePositions.map((p, i) => (
            <line
              key={i}
              x1={(p / durationSec) * 1000}
              x2={(p / durationSec) * 1000}
              y1="8"
              y2="32"
              stroke="var(--text-muted)"
              strokeWidth="1.5"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
        {/* What goes, either side of what stays. */}
        <div className="absolute inset-y-0 left-0 bg-[color-mix(in_srgb,var(--error)_22%,transparent)]" style={{ width: pct(start) }} />
        <div className="absolute inset-y-0 right-0 bg-[color-mix(in_srgb,var(--error)_22%,transparent)]" style={{ left: pct(end) }} />
        <div className="absolute inset-y-0 w-px bg-[var(--text-strong)]" style={{ left: pct(playhead) }} />
        {handle("start", start, t("Start of the part to keep"))}
        {handle("end", end, t("End of the part to keep"))}
      </div>

      <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[var(--text-secondary)]">
            {t("Keep from")} <span className="tabular-nums text-[var(--text-strong)]">{formatOffset(start)}</span>
          </span>
          <button type="button" className="btn-outline px-2 py-0.5 text-xs" onClick={() => place("start", playhead)}>
            {t("Set to the playing position")}
          </button>
          <button type="button" className="btn-outline px-2 py-0.5 text-xs" onClick={() => seek(start)}>
            {t("Play from here")}
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[var(--text-secondary)]">
            {t("Keep until")} <span className="tabular-nums text-[var(--text-strong)]">{formatOffset(end)}</span>
          </span>
          <button type="button" className="btn-outline px-2 py-0.5 text-xs" onClick={() => place("end", playhead)}>
            {t("Set to the playing position")}
          </button>
          <button type="button" className="btn-outline px-2 py-0.5 text-xs" onClick={() => seek(Math.max(0, end - 10))}>
            {t("Play the last 10 seconds")}
          </button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-[var(--text-muted)]">
          {t("Keeps {length} of {total}.", { length: formatOffset(end - start), total: formatOffset(durationSec) })}
        </p>
        <div className="flex gap-2">
          <button type="button" className="btn-outline" onClick={() => setOpen(false)} disabled={busy}>
            {t("Cancel")}
          </button>
          <button
            type="button"
            className="btn-ink bg-[var(--error)]"
            onClick={() => void trim()}
            disabled={busy || (start <= 0 && end >= durationSec)}
          >
            {busy ? t("Working…") : t("Trim")}
          </button>
        </div>
      </div>
      {error ? <p className="mt-2 text-xs text-[var(--error)]">{error}</p> : null}
    </div>
  );
}
