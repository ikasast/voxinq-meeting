"use client";

import { useEffect, useState } from "react";
import { sttHttpBase } from "@/lib/stt/client";

type State = { exists: boolean; protected?: boolean };

// Recording/protection badges on list cards. Queries STT for the meeting IDs in bulk
// and injects the badge for each meeting. Shows nothing if STT is unreachable.
export function RecordingBadges({ ids }: { ids: string[] }) {
  const [states, setStates] = useState<Record<string, State>>({});

  useEffect(() => {
    if (ids.length === 0) return;
    let cancelled = false;
    fetch(`${sttHttpBase()}/recordings/states`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
      signal: AbortSignal.timeout(6000),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Record<string, State> | null) => {
        if (!cancelled && d) setStates(d);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // Compare by join so ids only changes when the list content changes.
  }, [ids.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // Inject the fetched states into each card's placeholder.
    for (const [id, st] of Object.entries(states)) {
      const el = document.querySelector<HTMLElement>(`[data-rec-badge="${id}"]`);
      if (!el) continue;
      if (!st.exists) {
        el.textContent = "";
        continue;
      }
      el.textContent = st.protected ? "🔒 Protected" : "🎙 Recording";
      el.className = st.protected
        ? "rounded-full border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] px-1.5 py-0.5 text-[10px] text-[var(--accent-sub)]"
        : "rounded-full border border-[var(--border-strong)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)]";
    }
  }, [states]);

  return null;
}
