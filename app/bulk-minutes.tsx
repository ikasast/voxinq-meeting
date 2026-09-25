"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "./locale-provider";

// "Record now, write the minutes later" — which is how a day of meetings actually goes, and at
// a conference how a week of them does. This is the later: the meetings in view that have no
// minutes, and one button that puts them all in the queue.
//
// It works on what the list is showing, so the filters above it are the selection: a series, a
// day, a search. The queue decides what runs when; this only fills it.

export type BulkCandidate = { id: string; title: string; when: string };

export function BulkMinutes({ candidates }: { candidates: BulkCandidate[] }) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(candidates.map((c) => c.id)));

  // The list changes under this when a filter does. Re-deriving during the render rather than
  // in an effect keeps the two from disagreeing for a frame — and keeps a meeting that has
  // since been written out of the request.
  const key = candidates.map((c) => c.id).join(",");
  const [syncedTo, setSyncedTo] = useState(key);
  if (syncedTo !== key) {
    setSyncedTo(key);
    setChosen(new Set(candidates.map((c) => c.id)));
  }

  if (candidates.length === 0) return null;

  const toggle = (id: string) =>
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const send = async () => {
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/claude/summary/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meetingIds: [...chosen] }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      setOpen(false);
      // The cards now say "Generating minutes…", and the queue pane has the jobs.
      router.refresh();
    } catch (e) {
      setError(t("Could not queue the minutes ({reason})", { reason: (e as Error).message }));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="rounded-md border border-[color-mix(in_srgb,var(--warning)_40%,transparent)] bg-[color-mix(in_srgb,var(--warning)_8%,transparent)] px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex-1 text-xs text-[var(--text-secondary)]">
          {t("{n} of these meetings have no minutes yet", { n: candidates.length })}
        </p>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="btn-outline !px-3 !py-1 !text-xs"
        >
          {open ? t("Close") : t("Write them all")}
        </button>
      </div>

      {open ? (
        <>
          <div className="mt-2 flex items-center gap-2 text-xs">
            <button
              type="button"
              onClick={() => setChosen(new Set(candidates.map((c) => c.id)))}
              className="text-[var(--accent-sub)] hover:underline"
            >
              {t("Select all")}
            </button>
            <button
              type="button"
              onClick={() => setChosen(new Set())}
              className="text-[var(--text-muted)] hover:underline"
            >
              {t("Clear")}
            </button>
          </div>

          <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto">
            {candidates.map((c) => (
              <li key={c.id}>
                <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-xs hover:bg-[var(--elevated)]">
                  <input
                    type="checkbox"
                    checked={chosen.has(c.id)}
                    onChange={() => toggle(c.id)}
                    className="h-3.5 w-3.5 accent-[var(--accent-solid)]"
                  />
                  <span className="min-w-0 flex-1 truncate text-[var(--foreground)]">{c.title}</span>
                  <span className="shrink-0 text-[var(--text-muted)]">{c.when}</span>
                </label>
              </li>
            ))}
          </ul>

          {error ? <p className="mt-2 text-xs text-[var(--error)]">{error}</p> : null}

          <div className="mt-2 flex justify-end">
            <button
              type="button"
              onClick={() => void send()}
              disabled={sending || chosen.size === 0}
              className="btn-ink !px-3 !py-1.5 !text-xs"
            >
              {sending
                ? t("Sending…")
                : t("Queue {n} for minutes", { n: chosen.size })}
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
