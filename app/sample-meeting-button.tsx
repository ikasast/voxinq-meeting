"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useT } from "./locale-provider";

// The way in, offered where somebody with no meetings is standing.
//
// An empty list used to say "No meetings yet" and stop there. The only thing on the screen was
// New meeting, which starts a recording — so the first thing this app asked of a new person was
// to talk into it before they had seen what it does with the result. This is the other door.

export function SampleMeetingButton() {
  const t = useT();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/meetings/sample", { method: "POST" });
      const d = (await res.json().catch(() => null)) as { id?: string; error?: string } | null;
      if (!res.ok || !d?.id) throw new Error(d?.error ?? `HTTP ${res.status}`);
      // Straight to it: the guide card is on the meeting, and the point is to be reading it.
      router.push(`/${d.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("Could not create the sample meeting."));
      setBusy(false);
    }
  };

  return (
    <div className="mt-2 flex flex-col items-center gap-1">
      <button type="button" onClick={() => void create()} disabled={busy} className="btn-outline">
        {busy ? t("Creating…") : t("Create a sample meeting")}
      </button>
      <span className="text-xs text-[var(--text-muted)]">
        {t("A finished meeting with real transcript text, to try everything on before a real one.")}
      </span>
      {error ? <span className="text-xs text-[var(--error)]">{error}</span> : null}
    </div>
  );
}
