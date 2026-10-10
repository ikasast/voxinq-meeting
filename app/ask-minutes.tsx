"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChatIcon, CloseIcon, SendIcon } from "./icons";
import { useT } from "./locale-provider";
import { busyLabel } from "@/lib/queue/job-label";
import { useGpuBusy } from "./use-gpu-busy";

type Answer = {
  answer: string;
  used: number;
  omitted: number;
  withoutMinutes: number;
  // Set when the meeting was too long to read in one pass and was condensed first.
  condensed?: boolean;
};

type Source = "minutes" | "transcript";

/** One question and what came back, in the order they were asked. Nothing is stored. */
type Turn = { question: string; source: Source; answer?: Answer; error?: string };

// Asking about meetings, as a chat that floats at the bottom right (v4).
//
// It was a box under the minutes on a meeting and a card on a series: one more section to scroll
// past, and gone from sight as soon as you scrolled to the part you had a question about. Now it
// is a round button in the corner, on whatever is being read, and a small chat window above it.
// The questions and answers stay in the window while it is open on this page; none are saved.
//
// What it reads: a series' minutes (a one-off meeting is a series of one), or one meeting's own
// words, offered where both exist — a series of transcripts is several times any local model's
// context.
export function AskMinutes({
  seriesId,
  meetingId,
  scopeLabel,
  hasMinutes = true,
  hasTranscript = false,
}: {
  seriesId?: string;
  meetingId?: string;
  /** What the minutes are: the series' name, or the meeting's title. */
  scopeLabel: string;
  /** Whether there are minutes to read. False on a meeting recorded but not written up yet. */
  hasMinutes?: boolean;
  /**
   * Whether this one meeting's own words can be read instead. Only offered for a meeting: a
   * series of transcripts is several times any local model's context.
   */
  hasTranscript?: boolean;
}) {
  // What to read. The minutes when there are any — they are the reviewed version, and the
  // dense one — and the meeting's own words when there are not, or when asked for.
  const [source, setSource] = useState<Source>(hasMinutes ? "minutes" : "transcript");
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const t = useT();
  const examples = [
    t("What were the TODOs from last time?"),
    t("What is still unresolved?"),
    t("Summarise the decisions so far"),
  ];
  const gpu = useGpuBusy();
  // Answering runs on the same GPU as minutes generation and recording.
  const blocked = gpu.busy;
  const input = useRef<HTMLInputElement>(null);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open]);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [turns, asking]);

  const ask = async (q: string) => {
    const text = q.trim();
    if (!text || asking) return;
    setAsking(true);
    setQuestion("");
    const turn: Turn = { question: text, source };
    setTurns((all) => [...all, turn]);
    const settle = (done: Partial<Turn>) =>
      setTurns((all) => all.map((x) => (x === turn ? { ...x, ...done } : x)));
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text, seriesId, meetingId, source }),
      });
      const d = (await res.json().catch(() => null)) as (Answer & { error?: string }) | null;
      if (!res.ok) throw new Error(d?.error ?? `HTTP ${res.status}`);
      settle({ answer: d as Answer });
    } catch (e) {
      settle({ error: (e as Error).message });
    } finally {
      setAsking(false);
    }
  };

  const title = source === "transcript" ? t("Ask about this meeting") : t("Ask about these minutes");

  return (
    <>
      {open ? (
        <section
          role="dialog"
          aria-label={title}
          // Above the button, at the corner; on a phone, the width of the screen.
          className="fixed bottom-[calc(5rem+var(--dock-space,0px))] right-4 z-50 flex h-[min(34rem,calc(100dvh-8rem-var(--dock-space,0px)))] w-[min(24rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] shadow-2xl"
        >
          <header className="border-b border-[var(--border)] px-4 py-3">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-semibold text-[var(--text-strong)]">{title}</h2>
                <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                  {source === "transcript"
                    ? t("Answered from everything said in {scope} — nothing else. Answers are not saved.", {
                        scope: meetingId && seriesId ? t("this meeting") : scopeLabel,
                      })
                    : t("Answered from the minutes of {scope} — nothing else. Answers are not saved.", {
                        scope: scopeLabel,
                      })}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                title={t("Close")}
                aria-label={t("Close")}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--hover-surface)] hover:text-[var(--foreground)]"
              >
                <CloseIcon className="h-4 w-4" />
              </button>
            </div>
            {/* Only where both exist: a series of transcripts is several times any local model's
                context, and a meeting with no minutes has nothing to choose between. */}
            {meetingId && hasTranscript && hasMinutes ? (
              <div className="mt-2 inline-flex overflow-hidden rounded-full border border-[var(--border-strong)] text-xs">
                {(["minutes", "transcript"] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setSource(option)}
                    disabled={asking}
                    className={
                      option === source
                        ? "bg-[var(--btn-primary-bg)] px-3 py-1 font-medium text-[var(--btn-primary-text)]"
                        : "px-3 py-1 text-[var(--text-secondary)] hover:bg-[var(--hover-surface)]"
                    }
                  >
                    {option === "minutes" ? t("From the minutes") : t("From the transcript")}
                  </button>
                ))}
              </div>
            ) : null}
          </header>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {turns.length === 0 ? (
              <div className="flex flex-col items-start gap-1.5">
                <p className="text-xs text-[var(--text-muted)]">{t("For example:")}</p>
                {examples.map((ex) => (
                  <button
                    key={ex}
                    type="button"
                    onClick={() => void ask(ex)}
                    disabled={asking || blocked}
                    className="rounded-full border border-[var(--border-strong)] px-3 py-1 text-left text-xs text-[var(--text-secondary)] hover:bg-[var(--hover-surface)] disabled:opacity-50"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            ) : null}
            {turns.map((turn, i) => (
              <div key={i} className="space-y-2">
                <p className="ml-8 rounded-2xl rounded-br-sm bg-[var(--btn-primary-bg)] px-3 py-2 text-sm text-[var(--foreground)]">
                  {turn.question}
                </p>
                {turn.answer ? (
                  <div className="mr-4 rounded-2xl rounded-bl-sm bg-[var(--elevated)] px-3 py-2">
                    <article className="prose prose-invert prose-sm minutes-prose max-w-none prose-headings:font-semibold">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{turn.answer.answer}</ReactMarkdown>
                    </article>
                    {/* Say what the answer could actually see, so a gap is visible rather than implied. */}
                    <p className="mt-2 border-t border-[var(--border)] pt-1.5 text-[11px] text-[var(--text-muted)]">
                      {turn.source === "transcript" ? (
                        turn.answer.condensed
                          ? t("Based on the whole of this meeting, read as notes taken from it (it was too long to read at once).")
                          : t("Based on everything said in this meeting.")
                      ) : (
                        <>
                          {t(
                            turn.answer.used === 1
                              ? "Based on 1 meeting with minutes"
                              : "Based on {n} meetings with minutes",
                            { n: turn.answer.used },
                          )}
                          {turn.answer.omitted > 0
                            ? t(", {n} older left out for length", { n: turn.answer.omitted })
                            : ""}
                          {turn.answer.withoutMinutes > 0
                            ? t(", {n} without minutes not covered", { n: turn.answer.withoutMinutes })
                            : ""}
                          {/* The sentence's end, in the reader's language: "。" in Japanese. */}
                          {t(".")}
                        </>
                      )}
                    </p>
                  </div>
                ) : turn.error ? (
                  <p className="mr-4 text-xs text-[var(--error)]">{turn.error}</p>
                ) : (
                  <p className="text-xs text-[var(--text-muted)]">
                    <span aria-hidden className="mr-1.5 inline-block size-1.5 animate-pulse rounded-full bg-[var(--accent)]" />
                    {t("Thinking…")}
                  </p>
                )}
              </div>
            ))}
            <div ref={end} />
          </div>

          <footer className="border-t border-[var(--border)] px-3 py-2.5">
            {blocked ? (
              <p className="mb-2 text-xs text-[var(--warning)]">
                {t("{task} — you can ask once it finishes.", { task: busyLabel(t, gpu.kind) })}
              </p>
            ) : null}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void ask(question);
              }}
              className="flex items-center gap-2"
            >
              <input
                ref={input}
                type="text"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                maxLength={500}
                placeholder={examples[0]}
                disabled={blocked}
                aria-label={title}
                className="input min-w-0 flex-1"
              />
              <button
                type="submit"
                disabled={asking || blocked || !question.trim()}
                title={t("Ask")}
                aria-label={t("Ask")}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[var(--btn-primary-border)] bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] hover:bg-[var(--btn-primary-hover)] disabled:opacity-50"
              >
                <SendIcon className="h-4 w-4" />
              </button>
            </form>
          </footer>
        </section>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title={open ? t("Close") : title}
        aria-label={open ? t("Close") : title}
        // Lifted over a recording's dock or bar when one is showing (they set --dock-space).
        className="fixed bottom-[calc(1rem+var(--dock-space,0px))] right-4 z-50 inline-flex h-12 w-12 items-center justify-center rounded-full border border-[var(--btn-primary-border)] bg-[color-mix(in_srgb,var(--accent)_16%,var(--surface))] text-[var(--btn-primary-text)] shadow-lg hover:bg-[color-mix(in_srgb,var(--accent)_26%,var(--surface))]"
      >
        {open ? <CloseIcon className="h-5 w-5" /> : <ChatIcon className="h-5 w-5" />}
      </button>
    </>
  );
}
