"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { abortMinutesAndSettle, currentMinutesBusy } from "@/lib/minutes-busy";
import { preloadStt, sttWarmupFromSettings } from "@/lib/stt/preload";
import { defaultMeetingTitle } from "@/lib/utils";

// Landing point for the home-screen shortcut "new recording".
// Creates a meeting with the default title (datetime) and jumps straight to the recording
// page (one-tap recording). Like the New meeting screen, it first checks whether minutes
// are generating — recording needs that GPU — and offers to interrupt them before creating
// the meeting (so cancelling leaves no empty meeting behind).
export default function QuickRecordPage() {
  const router = useRouter();
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmMeetingId, setConfirmMeetingId] = useState<string | undefined>(undefined);
  const [phase, setPhase] = useState<"checking" | "confirm" | "starting">("checking");

  const start = async () => {
    setPhase("starting");
    // Warm the Whisper model while the meeting is being created — the caller has already
    // established that minutes generation isn't holding the GPU. This path records with the
    // settings model (it creates the meeting without a per-meeting override), so the settings
    // value is the right thing to warm.
    void sttWarmupFromSettings().then((s) => preloadStt(s.model, s.translate));
    try {
      const res = await fetch("/api/meetings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: defaultMeetingTitle(), description: "" }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const m = (await res.json()) as { id: string };
      router.replace(`/${m.id}/recording?autostart=1`);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void (async () => {
      const mb = await currentMinutesBusy();
      if (mb.busy) {
        setConfirmMeetingId(mb.meetingId);
        setPhase("confirm");
      } else {
        await start();
      }
    })();
    // start/router are stable for this one-shot effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const interruptAndStart = async () => {
    setPhase("starting");
    await abortMinutesAndSettle(confirmMeetingId);
    await start();
  };

  if (error) {
    return (
      <div className="mx-auto max-w-md py-24 text-center">
        <p className="text-sm text-[var(--error)]">Failed to start recording: {error}</p>
        <button type="button" onClick={() => router.push("/new")} className="btn-ink mt-4">
          Go to New meeting
        </button>
      </div>
    );
  }

  if (phase === "confirm") {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div className="card w-full max-w-sm space-y-4 p-6">
          <h2 className="text-lg font-semibold text-[var(--text-strong)]">
            Minutes are being generated
          </h2>
          <p className="text-sm text-[var(--text-secondary)]">
            Recording uses the GPU that minutes generation is running on. Interrupt the
            in-progress minutes and start recording now? You can regenerate those minutes
            afterward.
          </p>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => router.push("/")} className="btn-outline">
              Keep generating
            </button>
            <button type="button" onClick={() => void interruptAndStart()} className="btn-ink">
              Interrupt &amp; record
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md py-24 text-center">
      <p className="flex items-center justify-center gap-2 text-sm text-[var(--text-muted)]">
        <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-[var(--border-strong)] border-t-[var(--accent)]" />
        Preparing to record…
      </p>
    </div>
  );
}
