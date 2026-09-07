"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useT } from "./locale-provider";
import { useGpuBusy } from "./use-gpu-busy";

type Answer = { answer: string; used: number; omitted: number; withoutMinutes: number };

// Ask a question against the minutes of a series (or of a single meeting that has no
// series — a one-off is just a series of one). The answer is read once and not stored.
/** What `useGpuBusy` reports, in the reader's language. */
function busyLabel(t: (k: string) => string, label: string): string {
  const table: Record<string, string> = {
    "Generating minutes…": t("Generating minutes…"),
    "Recording in progress…": t("Recording in progress…"),
    "Transcribing…": t("Transcribing…"),
    "Diarizing…": t("Diarizing…"),
  };
  return table[label] ?? label;
}

export function AskMinutes({
  seriesId,
  meetingId,
  scopeLabel,
}: {
  seriesId?: string;
  meetingId?: string;
  scopeLabel: string;
}) {
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [result, setResult] = useState<Answer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const t = useT();
  const examples = [
    t("What were the TODOs from last time?"),
    t("What is still unresolved?"),
    t("Summarise the decisions so far"),
  ];
  const gpu = useGpuBusy();
  // Answering runs on the same GPU as minutes generation and recording.
  const blocked = gpu.busy;

  const ask = async (q: string) => {
    const text = q.trim();
    if (!text || asking) return;
    setAsking(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text, seriesId, meetingId }),
      });
      const d = (await res.json().catch(() => null)) as (Answer & { error?: string }) | null;
      if (!res.ok) throw new Error(d?.error ?? `HTTP ${res.status}`);
      setResult(d as Answer);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAsking(false);
    }
  };

  return (
    <section className="card space-y-3 p-5">
      <div>
        <h2 className="section-title text-sm font-semibold text-[var(--text-strong)]">
          {t("Ask about these minutes")}
        </h2>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          {t("Answered from the minutes of {scope} — nothing else. Answers are not saved.", {
            scope: scopeLabel,
          })}
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void ask(question);
        }}
        className="flex flex-wrap items-center gap-2"
      >
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          maxLength={500}
          placeholder={examples[0]}
          disabled={asking || blocked}
          className="input min-w-0 flex-1"
        />
        <button type="submit" disabled={asking || blocked || !question.trim()} className="btn-ink">
          {asking ? t("Thinking…") : t("Ask")}
        </button>
      </form>

      {blocked ? (
        <p className="text-xs text-[var(--warning)]">
          {t("{task} — you can ask once it finishes.", {
            task: gpu.label ? busyLabel(t, gpu.label) : t("A GPU task is running"),
          })}
        </p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {examples.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => {
                setQuestion(ex);
                void ask(ex);
              }}
              disabled={asking}
              className="rounded-full border border-[var(--border-strong)] px-2.5 py-0.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--hover-surface)] disabled:opacity-50"
            >
              {ex}
            </button>
          ))}
        </div>
      )}

      {error ? <p className="text-xs text-[var(--error)]">{error}</p> : null}

      {result ? (
        <div className="rounded-md border border-[var(--border)] bg-[var(--elevated)] p-4">
          <article className="prose prose-invert minutes-prose max-w-none prose-headings:font-semibold">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{result.answer}</ReactMarkdown>
          </article>
          {/* Say what the answer could actually see, so a gap is visible rather than implied. */}
          <p className="mt-3 border-t border-[var(--border)] pt-2 text-[11px] text-[var(--text-muted)]">
            {t(
              result.used === 1
                ? "Based on 1 meeting with minutes"
                : "Based on {n} meetings with minutes",
              { n: result.used },
            )}
            {result.omitted > 0
              ? t(", {n} older left out for length", { n: result.omitted })
              : ""}
            {result.withoutMinutes > 0
              ? t(", {n} without minutes not covered", { n: result.withoutMinutes })
              : ""}
            .
          </p>
        </div>
      ) : null}
    </section>
  );
}
