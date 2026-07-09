"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { formatDateTime } from "@/lib/utils";
import { PencilIcon, RefreshIcon } from "../icons";
import { useGpuBusy } from "../use-gpu-busy";
import { CopySummaryButton } from "./copy-summary-button";
import { ShareButton } from "./share-button";

export type SummaryVersion = { id: string; text: string; createdAt: string };

// Display / edit / regenerate the minutes, plus version history.
// summaries is newest-first. Shows the not-generated state when empty.
export function SummarySection({
  meetingId,
  meetingTitle,
  summaries,
  summaryStatus,
  canGenerate,
}: {
  meetingId: string;
  meetingTitle: string;
  summaries: SummaryVersion[];
  summaryStatus: string | null;
  canGenerate: boolean;
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState(summaries[0]?.id ?? "");
  const current = useMemo(
    () => summaries.find((s) => s.id === selectedId) ?? summaries[0],
    [summaries, selectedId],
  );
  const isLatest = current?.id === summaries[0]?.id;

  // When a new version is generated (e.g. after regeneration), show the latest automatically.
  // Even if an older version is manually selected, switch to the latest the moment a new one arrives.
  const latestId = summaries[0]?.id ?? "";
  const prevLatestId = useRef(latestId);
  useEffect(() => {
    if (latestId && latestId !== prevLatestId.current) {
      prevLatestId.current = latestId;
      setSelectedId(latestId);
    }
  }, [latestId]);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(current?.text ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [genBusy, setGenBusy] = useState(false);

  const processing = summaryStatus === "processing";

  // Another GPU task running elsewhere (another meeting's minutes, or an STT job) blocks
  // starting a new generation here. This meeting's own "processing" is handled separately.
  const gpu = useGpuBusy();
  const otherBusy = gpu.busy && gpu.minutesMeetingId !== meetingId;

  // While processing, refresh the server periodically to pick up completion.
  useEffect(() => {
    if (!processing) return;
    const t = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(t);
  }, [processing, router]);

  const startEdit = () => {
    setDraft(current?.text ?? "");
    setError(null);
    setEditing(true);
  };
  const cancel = () => {
    setError(null);
    setEditing(false);
  };

  const save = async () => {
    const trimmed = draft.trim();
    if (!current || !trimmed || trimmed === current.text) {
      cancel();
      return;
    }
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/summaries/${current.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ summaryText: trimmed }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? `HTTP ${res.status}`);
      }
      setEditing(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setPending(false);
    }
  };

  const regenerate = async () => {
    setGenBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/claude/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meetingId }),
      });
      if (!res.ok && res.status !== 202) {
        const d = await res.json().catch(() => null);
        throw new Error(d?.error ?? `HTTP ${res.status}`);
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Regeneration failed");
    } finally {
      setGenBusy(false);
    }
  };

  const header = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="section-title text-lg font-semibold text-[var(--text-strong)]">Minutes</h2>
      {current && !editing ? (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={startEdit} className="btn-icon" title="Edit" aria-label="Edit">
            <PencilIcon />
          </button>
          <CopySummaryButton text={current.text} />
          <ShareButton
            text={current.text}
            title={`${meetingTitle} minutes`}
            filename={`${meetingTitle}-minutes.md`}
          />
          {canGenerate ? (
            <button
              type="button"
              onClick={regenerate}
              disabled={genBusy || processing || otherBusy}
              className="btn-icon-accent"
              title={
                otherBusy
                  ? `Busy: ${gpu.label ?? "another GPU task is running"}. Please wait.`
                  : "Regenerate the minutes from the current transcript"
              }
              aria-label="Regenerate"
            >
              <RefreshIcon className={genBusy ? "h-4 w-4 shrink-0 animate-spin" : "h-4 w-4 shrink-0"} />
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );

  // Not generated / processing (none yet) / error (none yet)
  if (!current) {
    return (
      <>
        <h2 className="section-title text-lg font-semibold text-[var(--text-strong)]">Minutes</h2>
        {processing ? (
          <div className="mt-4 flex items-center gap-2 text-sm text-[var(--text-muted)]">
            <Spinner />
            Generating minutes in the background. They will appear automatically when done…
          </div>
        ) : summaryStatus === "error" ? (
          <>
            <p className="mt-4 text-sm text-[var(--error)]">Failed to generate minutes.</p>
            {canGenerate ? <GenButton onClick={regenerate} busy={genBusy || otherBusy} label="Regenerate minutes" /> : null}
          </>
        ) : (
          <>
            <p className="mt-4 text-sm text-[var(--text-muted)]">No minutes generated yet.</p>
            {canGenerate ? (
              <GenButton onClick={regenerate} busy={genBusy || otherBusy} label="Generate minutes" />
            ) : (
              <p className="mt-2 text-xs text-[var(--text-muted)]">No transcript, so minutes cannot be generated.</p>
            )}
          </>
        )}
        {error ? <p className="mt-2 text-sm text-[var(--error)]">{error}</p> : null}
      </>
    );
  }

  return (
    <>
      {header}

      {processing ? (
        <div className="mt-3 flex items-center gap-2 rounded-md border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] bg-[color-mix(in_srgb,var(--accent)_8%,transparent)] px-3 py-2 text-sm text-[var(--accent-sub)]">
          <Spinner />
          Generating new minutes. A new version will be added below when done…
        </div>
      ) : null}

      {/* Version history (when there are 2 or more) */}
      {summaries.length > 1 && !editing ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
          <span>Version:</span>
          <select
            value={current.id}
            onChange={(e) => setSelectedId(e.target.value)}
            className="rounded-md border border-[var(--border-strong)] bg-[var(--elevated)] px-2 py-1 text-xs text-[var(--foreground)] focus:border-[var(--accent)] focus:outline-none"
          >
            {summaries.map((s, i) => (
              <option key={s.id} value={s.id}>
                {formatDateTime(s.createdAt)}
                {i === 0 ? " (latest)" : ""}
              </option>
            ))}
          </select>
          {!isLatest ? <span className="text-[var(--warning)]">Viewing an older version</span> : null}
        </div>
      ) : null}

      {error ? <p className="mt-2 text-sm text-[var(--error)]">{error}</p> : null}

      {editing ? (
        <div className="mt-4 space-y-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={18}
            autoFocus
            disabled={pending}
            className="input resize-y font-mono text-sm leading-relaxed"
          />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={cancel} disabled={pending} className="btn-outline">
              Cancel
            </button>
            <button type="button" onClick={save} disabled={pending} className="btn-ink">
              {pending ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      ) : (
        <article className="prose prose-invert mt-4 max-w-none prose-headings:font-semibold prose-h2:text-base prose-h2:mt-4">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{current.text}</ReactMarkdown>
        </article>
      )}
    </>
  );
}

function Spinner() {
  return (
    <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-[var(--border-strong)] border-t-[var(--accent)]" />
  );
}

function GenButton({ onClick, busy, label }: { onClick: () => void; busy: boolean; label: string }) {
  return (
    <div className="mt-4">
      <button type="button" onClick={onClick} disabled={busy} className="btn-ink">
        {busy ? "Starting…" : label}
      </button>
    </div>
  );
}
