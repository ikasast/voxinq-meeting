"use client";

import { useCallback, useEffect, useState } from "react";
import { useT } from "@/app/locale-provider";
import { formatOffset } from "@/lib/utils";
import type { Prep, PrepQuestion } from "@/lib/prep/prep";
import { showLine } from "./line-bus";

type State = { enabled: boolean; prep: Prep; job: "queued" | "running" | null; waiting: boolean };

/** Often enough to look live, and only a small read: the runs themselves are minutes apart. */
const POLL_MS = 5000;

/**
 * Getting ready for the questions after a talk: a short summary so far and questions worth
 * asking, kept up to date while the recording runs. The work happens on the server (lib/prep),
 * so this only shows it, and carries on being right after a phone's screen has been off.
 */
export function PrepPanel({
  meetingId,
  ended,
  initial,
}: {
  meetingId: string;
  ended: boolean;
  initial: State;
}) {
  const t = useT();
  const [state, setState] = useState<State>(initial);
  const [draft, setDraft] = useState("");
  const [failed, setFailed] = useState<string | null>(null);

  const url = `/api/meetings/${meetingId}/prep`;
  const live = state.enabled && !ended;
  const working = state.job !== null;

  useEffect(() => {
    if (!live && !working) return;
    const load = async () => {
      if (document.hidden) return;
      try {
        const res = await fetch(url, { cache: "no-store" });
        if (res.ok) setState((await res.json()) as State);
      } catch {
        // The next one tries again. A poll failing says nothing worth showing.
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), POLL_MS);
    document.addEventListener("visibilitychange", load);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", load);
    };
  }, [live, working, url]);

  const send = useCallback(
    async (body: object) => {
      setFailed(null);
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = (await res.json().catch(() => null)) as (State & { error?: string }) | null;
        if (!res.ok) {
          setFailed(data?.error ?? t("That did not work. Try again."));
          return false;
        }
        if (data) setState(data);
        return true;
      } catch {
        setFailed(t("That did not work. Try again."));
        return false;
      }
    },
    [t, url],
  );

  const { prep } = state;
  const has = prep.runs > 0 || prep.questions.length > 0;
  // Nothing to show on a finished meeting that never used this.
  if (ended && !has) return null;

  const open = prep.questions.filter((q) => !q.answered);
  const answered = prep.questions.filter((q) => q.answered);

  const add = async () => {
    const text = draft.trim();
    if (!text) return;
    if (await send({ action: "add", text })) setDraft("");
  };

  const row = (q: PrepQuestion) => {
    const isNew = q.source === "model" && q.run === prep.runs && prep.runs > 1 && !q.answered;
    return (
      <li key={q.id} className="border-t border-[var(--border)] py-2 first:border-t-0">
        <div className="flex items-start gap-2">
          <div className={`min-w-0 flex-1 ${q.answered ? "text-[var(--text-secondary)] line-through" : ""}`}>
            {isNew ? (
              <span className="mr-1.5 rounded bg-[var(--accent-soft,var(--panel))] px-1.5 py-0.5 text-[11px] text-[var(--text-secondary)] no-underline">
                {t("New")}
              </span>
            ) : null}
            {q.text}
            {q.en ? (
              <span lang="en" className="mt-0.5 block text-[var(--text-secondary)]">
                {q.en}
              </span>
            ) : null}
          </div>
          {!q.answered ? (
            <button
              type="button"
              onClick={() => void send({ action: "remove", id: q.id })}
              aria-label={t("Remove this question")}
              className="shrink-0 text-xs text-[var(--text-muted)] hover:text-[var(--foreground)]"
            >
              ×
            </button>
          ) : null}
        </div>
        {q.answered ? (
          <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-[var(--text-secondary)]">
            <span>
              {q.answered.ms !== null
                ? t("Answered at {time}", { time: formatOffset(q.answered.ms / 1000) })
                : t("Answered")}
            </span>
            <button type="button" onClick={() => showLine(meetingId, q.answered!.lineId)} className="underline">
              {t("Show the line")}
            </button>
            <button type="button" onClick={() => void send({ action: "keep", id: q.id })} className="underline">
              {t("Keep it")}
            </button>
          </div>
        ) : null}
      </li>
    );
  };

  return (
    <section
      aria-label={t("Preparing questions")}
      className="rounded-xl border border-[var(--border)] px-4 py-3 text-sm"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="font-medium text-[var(--foreground)]">{t("Questions for afterwards")}</h2>
        {working ? (
          <span className="text-xs text-[var(--text-secondary)]" aria-live="polite">
            {state.waiting ? t("Waiting for room on the GPU…") : t("Updating…")}
          </span>
        ) : prep.throughMs !== null ? (
          <span className="text-xs text-[var(--text-secondary)]">
            {t("Up to {time}", { time: formatOffset(prep.throughMs / 1000) })}
          </span>
        ) : null}
        <span className="ml-auto flex items-center gap-2">
          {state.enabled || ended ? (
            <button
              type="button"
              disabled={working}
              onClick={() => void send({ action: "run" })}
              className="btn-outline !px-2.5 !py-0.5 !text-xs"
            >
              {t("Update now")}
            </button>
          ) : null}
          {!ended ? (
            <label className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
              <input
                type="checkbox"
                checked={state.enabled}
                onChange={(e) => {
                  // Now, not when the server has answered: a box that does not tick looks broken.
                  const on = e.target.checked;
                  setState((s) => ({ ...s, enabled: on }));
                  void send({ action: "enable", on }).then((ok) => {
                    if (!ok) setState((s) => ({ ...s, enabled: !on }));
                  });
                }}
              />
              {t("Prepare during the recording")}
            </label>
          ) : null}
        </span>
      </div>

      {state.enabled && !ended ? (
        <p className="mt-1 text-xs text-[var(--text-secondary)]">
          {t("Updates every 5 minutes on the server, so it carries on with the screen off.")}
        </p>
      ) : null}

      {prep.skipped > 0 ? (
        <p className="mt-1 text-xs text-[var(--text-secondary)]">
          {t("The last update read only the newest part: {n} earlier lines did not fit.", { n: prep.skipped })}
        </p>
      ) : null}
      {prep.error ? <p className="mt-1 text-xs text-[var(--warning)]">{t(prep.error)}</p> : null}
      {failed ? <p className="mt-1 text-xs text-[var(--warning)]">{failed}</p> : null}

      {prep.summary.length > 0 ? (
        <div className="mt-3">
          <h3 className="text-xs font-medium text-[var(--text-secondary)]">{t("So far")}</h3>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {prep.summary.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {has || state.enabled ? (
        <div className="mt-3">
          <h3 className="text-xs font-medium text-[var(--text-secondary)]">{t("Questions")}</h3>
          {open.length === 0 && answered.length === 0 ? (
            <p className="mt-1 text-xs text-[var(--text-secondary)]">
              {t("Questions appear here once enough has been said.")}
            </p>
          ) : (
            <ul className="mt-0.5">
              {open.map(row)}
              {answered.map(row)}
            </ul>
          )}
          <form
            className="mt-2 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void add();
            }}
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={t("Add your own question")}
              aria-label={t("Add your own question")}
              className="min-w-0 flex-1 rounded-md border border-[var(--border)] bg-transparent px-2 py-1 text-sm"
            />
            <button type="submit" className="btn-outline !px-2.5 !py-0.5 !text-xs">
              {t("Add")}
            </button>
          </form>
        </div>
      ) : null}
    </section>
  );
}
