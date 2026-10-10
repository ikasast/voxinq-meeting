"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useT } from "./locale-provider";
import { useRecorder } from "./recorder";
import { runningTime, statusText } from "./recording-status";

// A recording that is running while you are somewhere else (v4, design B): a small bar floating
// at the bottom of every page but the meeting's own, where the dock is (recording-dock.tsx).
// The meeting's name leads back there; Stop stops taking audio and leaves the meeting open, as
// the dock's button does.
//
// Leaving the recording screen used to stop the recording. Now the recording is the app's
// (recorder.tsx), and this bar is how you know it is still going.

export function RecordingBar() {
  const t = useT();
  const pathname = usePathname();
  const r = useRecorder();
  const s = r.session;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!s) return;
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(tick);
  }, [s]);

  // Not on the meeting's own page, where the dock is the recording's controls.
  if (!s || pathname === `/${s.meetingId}` || pathname === `/${s.meetingId}/recording`) return null;

  const listening = r.status === "open";
  const trouble = r.status === "error" || r.status === "closed";
  const elapsed = s.startedAt ? Math.max(0, Math.floor((now - s.startedAt) / 1000)) : null;
  const title = s.title || t("Meeting");

  return (
    <div
      role="status"
      aria-label={t("Recording “{title}”", { title })}
      className="fixed bottom-4 left-1/2 z-40 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-3 rounded-full border border-[var(--border-strong)] bg-[var(--elevated)] py-1.5 pl-4 pr-1.5 text-sm shadow-lg"
      style={{ marginBottom: "env(safe-area-inset-bottom)" }}
    >
      <span
        aria-hidden
        className={`inline-block h-3 w-3 shrink-0 rounded-full border p-px ${
          trouble
            ? "border-[var(--warning)]"
            : "recording-dot border-[color-mix(in_srgb,var(--error)_45%,transparent)]"
        }`}
      >
        <span className={`block h-full w-full rounded-full ${trouble ? "bg-[var(--warning)]" : "bg-[var(--error)]"}`} />
      </span>
      <Link
        href={`/${s.meetingId}`}
        title={t("Open the meeting")}
        className="min-w-0 max-w-[16rem] truncate font-medium text-[var(--text-strong)] hover:underline"
      >
        {title}
      </Link>
      {elapsed !== null ? (
        <span className="shrink-0 tabular-nums text-[var(--text-secondary)]">{runningTime(elapsed)}</span>
      ) : null}
      {listening ? (
        // The meter is the proof that sound is still arriving.
        <span
          aria-hidden
          className={`hidden h-1.5 w-12 shrink-0 overflow-hidden rounded-full bg-[var(--hover-surface)] sm:block ${
            r.clipping ? "ring-1 ring-[var(--warning)]" : ""
          }`}
        >
          <span
            className={`block h-full rounded-full ${r.clipping ? "bg-[var(--warning)]" : "bg-[var(--accent-solid)]"}`}
            style={{ width: `${Math.min(100, Math.round(r.level * 300))}%` }}
          />
        </span>
      ) : (
        <span className={`shrink-0 text-xs ${trouble ? "text-[var(--warning)]" : "text-[var(--text-muted)]"}`}>
          {statusText(t, r.status)}
        </span>
      )}
      <button
        type="button"
        onClick={() => void r.stop()}
        title={t("Stop recording. The meeting stays open; end it on its page.")}
        aria-label={t("Stop recording")}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--error)] text-white hover:opacity-90"
      >
        <span aria-hidden className="h-2.5 w-2.5 rounded-[2px] bg-white" />
      </button>
    </div>
  );
}
