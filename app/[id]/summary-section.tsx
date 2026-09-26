"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { formatDateTimeIn } from "@/lib/i18n/format";
import { PencilIcon, RefreshIcon } from "../icons";
import { useGpuBusy } from "../use-gpu-busy";
import { CopySummaryButton } from "./copy-summary-button";
import { MinutesDownloadButton } from "./minutes-download-button";
import { ShareButton } from "./share-button";
import { useLocale, useT } from "@/app/locale-provider";
import { MinutesChoiceFields, useMinutesChoice } from "@/app/minutes-options";

export type SummaryVersion = { id: string; text: string; createdAt: string };

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
  const t = useT();
  const locale = useLocale();
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

  // "Regenerate with options" panel: per-run format, detail level and provider, prefilled from
  // the saved settings the first time it opens.
  const [showOptions, setShowOptions] = useState(false);
  const opts = useMinutesChoice();
  const toggleOptions = () => {
    setShowOptions((v) => !v);
    void opts.load();
  };

  const processing = summaryStatus === "processing";

  // Another GPU task running elsewhere (another meeting's minutes, or an STT job) blocks
  // starting a new generation here. This meeting's own "processing" is handled separately.
  const gpu = useGpuBusy();
  // Another meeting's work used to block this button. Minutes are a queued job now, so asking
  // while something else runs puts it in line instead of being refused — the wait is real, it
  // is just no longer a wall. What is left is something to say, not something to disable.
  const waitingOn = gpu.busy && gpu.minutesMeetingId !== meetingId ? gpu.label : null;

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
      setError(e instanceof Error ? e.message : t("Failed to save"));
    } finally {
      setPending(false);
    }
  };

  const regenerate = async (overrides?: {
    detail?: string;
    provider?: string;
    templateId?: string;
  }) => {
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
      setError(e instanceof Error ? e.message : t("Regeneration failed"));
    } finally {
      setGenBusy(false);
    }
  };

  // Stop the minutes for this meeting, whether they are being written or still waiting their
  // turn — with minutes running one at a time, waiting is the usual state. The meeting keeps
  // its previous version; the reason is recorded so it can be regenerated.
  const stopGeneration = async () => {
    setStopping(true);
    setError(null);
    try {
      await fetch(`/api/meetings/${encodeURIComponent(meetingId)}/minutes/stop`, {
        method: "POST",
      }).catch(() => {});
      router.refresh();
    } finally {
      setStopping(false);
    }
  };

  const header = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="section-title text-lg font-semibold text-[var(--text-strong)]">{t("Minutes")}</h2>
      {current && !editing ? (
        <div className="flex flex-wrap items-center gap-2">
          {!readOnly ? (
            <button type="button" onClick={startEdit} className="btn-icon" title={t("Edit")} aria-label={t("Edit")}>
              <PencilIcon />
            </button>
          ) : null}
          <CopySummaryButton text={current.text} />
          <ShareButton text={current.text} title={`${meetingTitle} minutes`} />
          <MinutesDownloadButton
            meetingId={meetingId}
            text={current.text}
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
                disabled={genBusy}
                className="btn-icon-accent"
                title={
                  waitingOn
                    ? `${waitingOn} — this will wait its turn in the queue.`
                    : t("Regenerate the minutes (choose detail & provider)")
                }
                aria-label={t("Regenerate")}
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
        <h2 className="section-title text-lg font-semibold text-[var(--text-strong)]">{t("Minutes")}</h2>
        {processing ? (
          <div className="mt-4 space-y-2">
            <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
              <Spinner />
              {t("Generating minutes in the background. They will appear automatically when done…")}
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
            {canGenerate && !readOnly ? <GenButton onClick={() => regenerate()} busy={genBusy} label="Retry" /> : null}
          </>
        ) : (
          <>
            <p className="mt-4 text-sm text-[var(--text-muted)]">{t("No minutes generated yet.")}</p>
            {canGenerate && !readOnly ? (
              <GenButton onClick={() => regenerate()} busy={genBusy} label={t("Generate minutes")} />
            ) : readOnly ? null : (
              <p className="mt-2 text-xs text-[var(--text-muted)]">{t("No transcript, so minutes cannot be generated.")}</p>
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
          <MinutesChoiceFields
            idPrefix="regen"
            choice={opts.choice}
            onChange={opts.setChoice}
            templates={opts.templates}
            models={opts.models}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-[var(--text-muted)]">
              {t("Applies to this run only — saved settings are unchanged.")}
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowOptions(false)} className="btn-outline">
                {t("Cancel")}
              </button>
              <button
                type="button"
                onClick={() =>
                  regenerate({
                    detail: opts.choice.detail,
                    provider: opts.choice.provider,
                    templateId: opts.choice.templateId || undefined,
                  })
                }
                disabled={genBusy || processing}
                className="btn-ink"
              >
                {genBusy ? t("Starting…") : t("Regenerate")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {processing ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] bg-[color-mix(in_srgb,var(--accent)_8%,transparent)] px-3 py-2 text-sm text-[var(--accent-sub)]">
          <Spinner />
          <span className="mr-auto">{t("Generating new minutes. A new version will be added below when done…")}</span>
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
          <span>{t("Version:")}</span>
          <select
            value={current.id}
            onChange={(e) => setSelectedId(e.target.value)}
            className="rounded-md border border-[var(--border-strong)] bg-[var(--elevated)] px-2 py-1 text-xs text-[var(--foreground)] focus:border-[var(--accent)] focus:outline-none"
          >
            {summaries.map((s, i) => (
              <option key={s.id} value={s.id}>
                {formatDateTimeIn(locale, s.createdAt)}
                {i === 0 ? ` (${t("latest")})` : ""}
              </option>
            ))}
          </select>
          {!isLatest ? <span className="text-[var(--warning)]">{t("Viewing an older version")}</span> : null}
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
              {t("Cancel")}
            </button>
            <button type="button" onClick={save} disabled={pending} className="btn-ink">
              {pending ? t("Saving…") : "Save"}
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
  const t = useT();
  return (
    <div className="mt-4">
      <button type="button" onClick={onClick} disabled={busy} className="btn-ink">
        {busy ? t("Starting…") : label}
      </button>
    </div>
  );
}

// Force-stop the running minutes generation. Shown in place of the regenerate button while
// a generation is in flight.
function StopButton({ onClick, busy }: { onClick: () => void; busy: boolean }) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      title={t("Stop the running minutes generation")}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-[color-mix(in_srgb,var(--error)_45%,transparent)] px-3 py-1.5 text-sm font-medium text-[var(--error)] hover:bg-[color-mix(in_srgb,var(--error)_10%,transparent)] disabled:opacity-50"
    >
      <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-[2px] bg-[var(--error)]" />
      {busy ? t("Stopping…") : t("Stop")}
    </button>
  );
}
