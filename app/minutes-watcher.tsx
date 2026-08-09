"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

// Keeps the meeting list in sync with background minutes generation. Polls the server for
// which meeting (if any) is generating and re-renders when that changes — so the
// "Generating minutes…" status appears and disappears live on the cards, even when the
// generation was started on another screen (its own detail page) while the list was open.
//
// `initial` is the meeting id already generating at render time (empty if none), so the
// first poll doesn't trigger a redundant refresh.
export function MinutesWatcher({ initial, intervalMs = 4000 }: { initial: string; intervalMs?: number }) {
  const router = useRouter();
  const last = useRef<string>(initial);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const d = (await fetch("/api/busy", { cache: "no-store" }).then((r) =>
          r.ok ? r.json() : null,
        )) as { minutes?: { busy?: boolean; meetingId?: string } } | null;
        const sig = d?.minutes?.busy ? String(d.minutes.meetingId ?? "1") : "";
        if (alive && sig !== last.current) {
          last.current = sig;
          router.refresh(); // re-render the server list to add/remove "Generating minutes…"
        }
      } catch {
        // ignore (STT/API blip) — try again next tick
      }
    };
    const t = setInterval(tick, intervalMs);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [router, intervalMs]);

  return null;
}
