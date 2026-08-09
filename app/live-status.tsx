"use client";

import { useEffect, useState } from "react";
import { sttHttpBase } from "@/lib/stt/client";

// Live per-meeting status on the list. Polls the STT service (which knows what the GPU is
// doing right now) and refines each card's status label: Recording… / Transcribing… /
// Diarizing…, and "Waiting…" for an open session that isn't actively recording.
//
// Minutes generation ("Generating minutes…") is server state, rendered as the baseline and
// left untouched here. When STT is unreachable the server baseline (e.g. "In progress") stays.
type Kind = "recording" | "transcribe" | "diarize" | null;

const LABEL: Record<"recording" | "transcribe" | "diarize", string> = {
  recording: "Recording…",
  transcribe: "Transcribing…",
  diarize: "Diarizing…",
};

export function LiveStatus({ ids }: { ids: string[] }) {
  const [activity, setActivity] = useState<Record<string, Kind> | null>(null);

  useEffect(() => {
    if (ids.length === 0) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const d = (await fetch(`${sttHttpBase()}/activity`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids }),
          signal: AbortSignal.timeout(4000),
        }).then((r) => (r.ok ? r.json() : null))) as Record<string, Kind> | null;
        if (!cancelled && d) setActivity(d);
      } catch {
        // STT unreachable — leave the server baseline in place.
      }
    };
    void poll();
    const t = setInterval(poll, 4000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids.join(",")]);

  useEffect(() => {
    if (!activity) return;
    const els = document.querySelectorAll<HTMLElement>("[data-live-status]");
    els.forEach((el) => {
      const id = el.dataset.liveStatus!;
      const base = el.dataset.liveBase ?? "";
      const open = el.dataset.liveOpen === "1";
      const kind = activity[id];
      let label = base; // default: restore the server baseline (handles "done" -> revert)
      if (kind === "recording" || kind === "transcribe" || kind === "diarize") {
        label = LABEL[kind];
      } else if (open) {
        label = "Waiting…";
      }
      el.textContent = label;
      el.className = label ? "tag-lime shrink-0" : "hidden";
    });
  }, [activity]);

  return null;
}
