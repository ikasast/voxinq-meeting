"use client";

import { useEffect } from "react";

// Taking the reader to one line of the transcript from somewhere else on the page — a point of
// meeting feedback, say. The transcript may be in a shut panel or another tab, so the page
// (meeting-body.tsx) is asked to show it first, and then the line is scrolled to and marked.

const SHOW = "voxinq:show-line";

export function showLine(meetingId: string, lineId: string) {
  window.dispatchEvent(new CustomEvent(SHOW, { detail: { meetingId, lineId } }));
}

/** Show the transcript when a line is asked for; the line itself is found once it is shown. */
export function useShowLine(meetingId: string, reveal: () => void) {
  useEffect(() => {
    const asked = (e: Event) => {
      const d = (e as CustomEvent<{ meetingId: string; lineId: string }>).detail;
      if (d.meetingId !== meetingId) return;
      reveal();
      // After the panel or tab has had a frame to appear.
      window.setTimeout(() => {
        const row = document.getElementById(`line-${d.lineId}`);
        if (!row) return;
        row.scrollIntoView({ behavior: "smooth", block: "center" });
        row.classList.add("ring-2", "ring-[var(--accent)]");
        window.setTimeout(() => row.classList.remove("ring-2", "ring-[var(--accent)]"), 1800);
      }, 120);
    };
    window.addEventListener(SHOW, asked);
    return () => window.removeEventListener(SHOW, asked);
  }, [meetingId, reveal]);
}
