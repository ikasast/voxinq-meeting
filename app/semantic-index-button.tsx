"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// Backfill button for the semantic-search index. Calls /api/semantic-index repeatedly
// (10 meetings per call) until nothing remains, then refreshes the list.
export function SemanticIndexButton({ unindexed }: { unindexed: number }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [left, setLeft] = useState(unindexed);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setRunning(true);
    setError(null);
    try {
      let remaining = left;
      do {
        const res = await fetch("/api/semantic-index", { method: "POST" });
        const d = (await res.json()) as { remaining?: number; error?: string };
        if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
        remaining = d.remaining ?? 0;
        setLeft(remaining);
      } while (remaining > 0);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Indexing failed");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="rounded-md border border-[color-mix(in_srgb,var(--warning)_45%,transparent)] bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] px-3 py-2 text-xs text-[var(--text-secondary)]">
      {left} meeting(s) are not in the AI search index yet, so they cannot match.
      <button
        type="button"
        onClick={() => void run()}
        disabled={running}
        className="ml-2 rounded-md border border-[var(--border-strong)] px-2 py-0.5 text-xs hover:bg-[var(--hover-surface)] disabled:opacity-50"
      >
        {running ? `Indexing… (${left} left)` : "Build index"}
      </button>
      {error ? <span className="ml-2 text-[var(--error)]">{error}</span> : null}
    </div>
  );
}
