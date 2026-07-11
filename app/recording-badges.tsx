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
      // Icon-only: 🔒 = recording protected, 🎙 = recording available (details on hover).
      el.textContent = st.protected ? "🔒" : "🎙";
      el.title = st.protected
        ? "Recording protected (not auto-deleted)"
        : "Recording available (auto-deletes after the retention period)";
      el.className = "text-[11px] leading-none";
    }
  }, [states]);

  return null;
}
