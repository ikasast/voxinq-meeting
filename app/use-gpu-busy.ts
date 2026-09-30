"use client";

import { useEffect, useState } from "react";
import { sttHttpBase } from "@/lib/stt/client";

// A single GPU serves recording (Whisper), re-transcription (Whisper), diarization (pyannote),
// and minutes generation (Ollama). Running two at once contends for VRAM, so the UI polls this
// to disable "start another task" actions while one is in progress.
export type GpuBusy = {
  busy: boolean;
  /** Minutes generation (Ollama) is what holds the queue. */
  minutesBusy: boolean;
  sttBusy: boolean; // STT is recording / transcribing / diarizing
  /**
   * What is running, as a job kind (`minutes`, `diarize`, `transcribe`, `recording`, `encrypt`),
   * or null. Turned into words with `busyLabel` from lib/queue/job-label.ts.
   */
  kind: string | null;
  /** Whose meeting the job at the front of the queue belongs to, if any. */
  minutesMeetingId?: string;
};

export function useGpuBusy(pollMs = 4000): GpuBusy {
  const [state, setState] = useState<GpuBusy>({
    busy: false,
    minutesBusy: false,
    sttBusy: false,
    kind: null,
  });

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      let minutes: {
        minutes?: { busy?: boolean; meetingId?: string; title?: string; kind?: string };
      } | null = null;
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
      // The queue's answer covers every kind of job, not only minutes — the field is called
      // `minutes` for history's sake — so the kind it names is what is said. Saying "Generating
      // minutes" whatever was running is how a diarization came to be reported as minutes.
      const mBusy = Boolean(minutes?.minutes?.busy);
      const sBusy = Boolean(stt?.busy);
      let kind: string | null = null;
      if (mBusy) kind = minutes?.minutes?.kind ?? null;
      else if (sBusy)
        kind =
          stt?.busyKind === "recording" ? "recording" : stt?.busyKind === "transcribe" ? "transcribe" : "diarize";
      setState({
        busy: mBusy || sBusy,
        minutesBusy: mBusy && kind === "minutes",
        sttBusy: sBusy,
        kind,
        minutesMeetingId: minutes?.minutes?.meetingId,
      });
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
