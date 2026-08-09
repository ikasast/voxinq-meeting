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

const DETAILS: { id: string; label: string }[] = [
  { id: "brief", label: "Brief (shorter)" },
  { id: "standard", label: "Standard" },
  { id: "detailed", label: "Detailed (fuller)" },
];

// Providers the user can pick for a one-off regeneration. Each provider uses the model
// configured for it in Settings — the panel just shows which one that is.
const PROVIDERS: { id: string; label: string }[] = [
  { id: "ollama", label: "Ollama (local)" },
  { id: "anthropic", label: "Anthropic" },
  { id: "openai", label: "OpenAI-compatible" },
];

// Display / edit / regenerate the minutes, plus version history.
// summaries is newest-first. Shows the not-generated state when empty.
export function SummarySection({
  meetingId,
  meetingTitle,
  summaries,
  summaryStatus,
  summaryError,
  canGenerate,
  readOnly = false,
}: {
  meetingId: string;
  meetingTitle: string;
  summaries: SummaryVersion[];
  summaryStatus: string | null;
  summaryError: string | null;
  canGenerate: boolean;
  // External (read-only) access can view/copy/share/download but not edit or regenerate.
  readOnly?: boolean;
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
  const [stopping, setStopping] = useState(false);

  // "Regenerate with options" panel: per-run detail level + provider, prefilled from saved settings.
  const [showOptions, setShowOptions] = useState(false);
  const [optDetail, setOptDetail] = useState("standard");
  const [optProvider, setOptProvider] = useState("ollama");
  const [optModels, setOptModels] = useState<Record<string, string>>({});
  const [optLoaded, setOptLoaded] = useState(false);

  const toggleOptions = async () => {
    setShowOptions((v) => !v);
    if (optLoaded) return;
    try {
      const res = await fetch("/api/settings");
      if (!res.ok) return;
      const s = await res.json();
      setOptDetail(s.summaryDetail ?? "standard");
      setOptProvider(s.llmProvider ?? "ollama");
      setOptModels({
        ollama: s.ollamaModel ?? "",
        anthropic: s.anthropicModel ?? "",
        openai: s.openaiModel ?? "",
      });
      setOptLoaded(true);
    } catch {
      // ignore — the user can still pick a provider / detail level
    }
  };

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

  const regenerate = async (overrides?: { detail?: string; provider?: string }) => {
    setGenBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/claude/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meetingId, ...overrides }),
      });
      if (!res.ok && res.status !== 202) {
        const d = await res.json().catch(() => null);
        throw new Error(d?.error ?? `HTTP ${res.status}`);
      }
      setShowOptions(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Regeneration failed");
    } finally {
      setGenBusy(false);
    }
  };

  // Force-stop the in-flight generation (aborts the LLM call and frees the GPU). The meeting
  // is left with the previous version; the reason is recorded so it can be regenerated.
  const stopGeneration = async () => {
    setStopping(true);
    setError(null);
    try {
      await fetch("/api/claude/summary/abort", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meetingId }),
      }).catch(() => {});
      router.refresh();
    } finally {
      setStopping(false);
    }
  };

  const header = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="section-title text-lg font-semibold text-[var(--text-strong)]">Minutes</h2>
      {current && !editing ? (
        <div className="flex flex-wrap items-center gap-2">
          {!readOnly ? (
            <button type="button" onClick={startEdit} className="btn-icon" title="Edit" aria-label="Edit">
              <PencilIcon />
            </button>
          ) : null}
          <CopySummaryButton text={current.text} />
          <ShareButton
            text={current.text}
            title={`${meetingTitle} minutes`}
            filename={`${meetingTitle}-minutes.md`}
          />
          {canGenerate && !readOnly ? (
            processing ? (
              // While generating, the regenerate button becomes a Stop button.
              <StopButton onClick={stopGeneration} busy={stopping} />
            ) : (
              // Opens the options panel (detail level + provider) — the actual run
              // starts from the panel's Regenerate button.
              <button
                type="button"
                onClick={toggleOptions}
                disabled={genBusy || otherBusy}
                className="btn-icon-accent"
                title={
                  otherBusy
                    ? `Busy: ${gpu.label ?? "another GPU task is running"}. Please wait.`
                    : "Regenerate the minutes (choose detail & provider)"
                }
                aria-label="Regenerate"
                aria-expanded={showOptions}
              >
                <RefreshIcon className={genBusy ? "h-4 w-4 shrink-0 animate-spin" : "h-4 w-4 shrink-0"} />
              </button>
            )
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
          <div className="mt-4 space-y-2">
            <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
              <Spinner />
              Generating minutes in the background. They will appear automatically when done…
            </div>
            {!readOnly ? <StopButton onClick={stopGeneration} busy={stopping} /> : null}
          </div>
        ) : summaryStatus === "error" ? (
          <>
            <p className="mt-4 text-sm text-[var(--error)]">
              Failed to generate minutes.
              {summaryError ? (
                <span className="mt-1 block text-xs opacity-90">Reason: {summaryError}</span>
              ) : null}
            </p>
            {canGenerate && !readOnly ? <GenButton onClick={() => regenerate()} busy={genBusy || otherBusy} label="Retry" /> : null}
          </>
        ) : (
          <>
            <p className="mt-4 text-sm text-[var(--text-muted)]">No minutes generated yet.</p>
            {canGenerate && !readOnly ? (
              <GenButton onClick={() => regenerate()} busy={genBusy || otherBusy} label="Generate minutes" />
            ) : readOnly ? null : (
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

      {/* Regenerate options: one-off detail level + provider for this run (settings unchanged). */}
      {showOptions && !editing ? (
        <div className="mt-3 space-y-3 rounded-md border border-[var(--border)] bg-[var(--elevated)] p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="regen-detail" className="label">
                Detail
              </label>
              <select
                id="regen-detail"
                value={optDetail}
                onChange={(e) => setOptDetail(e.target.value)}
                className="input mt-1"
              >
                {DETAILS.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="regen-provider" className="label">
                Provider
              </label>
              <select
                id="regen-provider"
                value={optProvider}
                onChange={(e) => setOptProvider(e.target.value)}
                className="input mt-1"
              >
                {PROVIDERS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
              {optModels[optProvider] ? (
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  Model: {optModels[optProvider]} (from Settings)
                </p>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-[var(--text-muted)]">
              Applies to this run only — saved settings are unchanged.
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowOptions(false)} className="btn-outline">
                Cancel
              </button>
              <button
                type="button"
                onClick={() => regenerate({ detail: optDetail, provider: optProvider })}
                disabled={genBusy || processing || otherBusy}
                className="btn-ink"
              >
                {genBusy ? "Starting…" : "Regenerate"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {processing ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] bg-[color-mix(in_srgb,var(--accent)_8%,transparent)] px-3 py-2 text-sm text-[var(--accent-sub)]">
          <Spinner />
          <span className="mr-auto">Generating new minutes. A new version will be added below when done…</span>
          {!readOnly ? <StopButton onClick={stopGeneration} busy={stopping} /> : null}
        </div>
      ) : summaryStatus === "error" ? (
        <div className="mt-3 rounded-md border border-[color-mix(in_srgb,var(--error)_45%,transparent)] bg-[color-mix(in_srgb,var(--error)_10%,transparent)] px-3 py-2 text-sm text-[var(--error)]">
          The last regeneration failed{summaryError ? `: ${summaryError}` : "."} Showing the
          previous version — use the ↻ button to retry.
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
        <article className="prose prose-invert minutes-prose mt-4 max-w-none prose-headings:font-semibold">
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

// Force-stop the running minutes generation. Shown in place of the regenerate button while
// a generation is in flight.
function StopButton({ onClick, busy }: { onClick: () => void; busy: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      title="Stop the running minutes generation"
      className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-[color-mix(in_srgb,var(--error)_45%,transparent)] px-3 py-1.5 text-sm font-medium text-[var(--error)] hover:bg-[color-mix(in_srgb,var(--error)_10%,transparent)] disabled:opacity-50"
    >
      <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-[2px] bg-[var(--error)]" />
      {busy ? "Stopping…" : "Stop"}
    </button>
  );
}
