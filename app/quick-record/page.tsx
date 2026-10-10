"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "../locale-provider";
import { preloadSttIfIdle, sttWarmupFromSettings } from "@/lib/stt/preload";

// Landing point for the home-screen shortcut "new recording".
// Creates a meeting the server names after the day, and jumps straight to the recording
// page (one-tap recording).
//
// It used to ask first whether to stop minutes that were being written, and stopping them
// here threw them away. The recording page asks instead, as recording starts, about whatever
// is using the card -- and what it interrupts goes back to the front of the queue.
export default function QuickRecordPage() {
  const t = useT();
  const router = useRouter();
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    // Warm the Whisper model while the meeting is being created, unless minutes are being
    // written: a load now would only contend with them, and the recording page is about to ask
    // about them anyway. This path records with the settings model (it creates the meeting
    // without a per-meeting override), so the settings value is the right thing to warm.
    void sttWarmupFromSettings().then((s) => preloadSttIfIdle(s.model, s.translate));
    try {
      const res = await fetch("/api/meetings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // No title: the server names it after today, in the shape this reader chose.
        body: JSON.stringify({ description: "" }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const m = (await res.json()) as { id: string };
      router.replace(`/${m.id}?autostart=1`);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void start();
    // start/router are stable for this one-shot effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) {
    return (
      <div className="mx-auto max-w-md py-24 text-center">
        <p className="text-sm text-[var(--error)]">
          {t("Failed to start recording: {error}", { error })}
        </p>
        <button type="button" onClick={() => router.push("/new")} className="btn-ink mt-4">
          {t("Go to New meeting")}
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md py-24 text-center">
      <p className="flex items-center justify-center gap-2 text-sm text-[var(--text-muted)]">
        <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-[var(--border-strong)] border-t-[var(--accent)]" />
        {t("Preparing to record…")}
      </p>
    </div>
  );
}
