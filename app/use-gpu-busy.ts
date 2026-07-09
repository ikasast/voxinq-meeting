"use client";

import { useEffect, useState } from "react";
import { sttHttpBase } from "@/lib/stt/client";

// A single GPU serves recording (Whisper), re-transcription (Whisper), diarization (pyannote),
// and minutes generation (Ollama). Running two at once contends for VRAM, so the UI polls this
// to disable "start another task" actions while one is in progress.
export type GpuBusy = {
  busy: boolean;
  label: string | null; // human-readable current task, e.g. "Generating minutes…"
  minutesMeetingId?: string; // meeting whose minutes are being generated (if any)
};

export function useGpuBusy(pollMs = 4000): GpuBusy {
  const [state, setState] = useState<GpuBusy>({ busy: false, label: null });

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      let minutes: { minutes?: { busy?: boolean; meetingId?: string; title?: string } } | null = null;
      let stt: { busy?: boolean; busyKind?: string } | null = null;
      try {
        minutes = await fetch("/api/busy", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null));
      } catch {
        /* ignore */
      }
      try {
        stt = await fetch(`${sttHttpBase()}/health`, {
          cache: "no-store",
          signal: AbortSignal.timeout(4000),
        }).then((r) => (r.ok ? r.json() : null));
      } catch {
        /* ignore (external access / STT unreachable) */
      }
      if (cancelled) return;
      const mBusy = Boolean(minutes?.minutes?.busy);
      const sBusy = Boolean(stt?.busy);
      let label: string | null = null;
      if (mBusy) label = "Generating minutes…";
      else if (sBusy)
        label =
          stt?.busyKind === "recording"
            ? "Recording in progress…"
            : stt?.busyKind === "transcribe"
              ? "Transcribing…"
              : "Diarizing…";
      setState({ busy: mBusy || sBusy, label, minutesMeetingId: minutes?.minutes?.meetingId });
    };
    void check();
    const t = setInterval(() => void check(), pollMs);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [pollMs]);

  return state;
}
