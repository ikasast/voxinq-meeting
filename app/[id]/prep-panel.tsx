"use client";

import { useCallback, useEffect, useState } from "react";
import { useT } from "@/app/locale-provider";
import { Switch } from "@/app/switch";
import { formatOffset } from "@/lib/utils";
import type { Prep, PrepQuestion } from "@/lib/prep/prep";
import { showLine } from "./line-bus";

type State = { enabled: boolean; prep: Prep; job: "queued" | "running" | null; waiting: boolean };

export type PrepStart = {
  /** External browsers are not shown this: it is written for whoever is going to ask. */
  show: boolean;
  /** Not being recorded: there is nothing more to prepare, and what there is can still be read. */
  ended: boolean;
  initial: State;
};

/** Often enough to look live, and only a small read: the runs themselves are minutes apart. */
const POLL_MS = 5000;

/**
 * Getting ready for the questions after a talk: a short summary so far and questions worth
 * asking, kept up to date while the recording runs. The work happens on the server (lib/prep),
 * so this only shows it, and carries on being right after a phone's screen has been off.
 *
 * The page's layout depends on it, so the state lives here and meeting-body.tsx holds it.
 */
export function usePrep(meetingId: string, { show, ended, initial }: PrepStart) {
  const t = useT();
  const [state, setState] = useState<State>(initial);
  const [failed, setFailed] = useState<string | null>(null);

  const url = `/api/meetings/${meetingId}/prep`;
  const live = show && state.enabled && !ended;
  const working = show && state.job !== null;

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

  const enable = (on: boolean) => {
    // Now, not when the server has answered: a switch that does not move looks broken.
    setState((s) => ({ ...s, enabled: on }));
    void send({ action: "enable", on }).then((ok) => {
      if (!ok) setState((s) => ({ ...s, enabled: !on }));
    });
  };

  const { prep } = state;
  return {
    meetingId,
    state,
    failed,
    send,
    enable,
    ended,
    live,
    working,
    /** Whether anything has been prepared to read. */
    has: show && (prep.runs > 0 || prep.questions.length > 0),
    /** Whether the page offers this at all: nothing to show on a finished meeting that never used it. */
    offered: show && (!ended || prep.runs > 0 || prep.questions.length > 0),
    openCount: prep.questions.filter((q) => !q.answered).length,
  };
}

export type PrepModel = ReturnType<typeof usePrep>;

const ROW = "w-full rounded-md px-2 text-left hover:bg-[color-mix(in_srgb,var(--text-muted)_12%,transparent)]";
const SMALL_LINK = "text-xs text-[var(--text-secondary)] underline hover:text-[var(--foreground)]";

/** Asked, not answered: what the panel is for, so it reads first and in the page's own size. */
function OpenQuestion({ q, isNew, model }: { q: PrepQuestion; isNew: boolean; model: PrepModel }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <li>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className={`${ROW} flex items-start gap-2 py-1.5 text-sm text-[var(--foreground)]`}
      >
        <span className="min-w-0 flex-1">{q.text}</span>
        {isNew ? <span className="mt-0.5 shrink-0 text-[11px] text-[var(--accent)]">{t("New")}</span> : null}
        {q.en ? (
          <span className="mt-0.5 shrink-0 rounded border border-[var(--border-strong)] px-1 text-[10px] leading-4 text-[var(--text-muted)]">
            EN
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="space-y-1 px-2 pb-2">
          {q.en ? (
            <p lang="en" className="border-t border-[var(--border)] pt-1.5 text-sm text-[var(--text-secondary)]">
              {q.en}
            </p>
          ) : null}
          <button type="button" onClick={() => void model.send({ action: "remove", id: q.id })} className={SMALL_LINK}>
            {t("Remove this question")}
          </button>
        </div>
      ) : null}
    </li>
  );
}

/** Answered: out of the way, and one press from checking it or taking it back. */
function AnsweredQuestion({ q, model }: { q: PrepQuestion; model: PrepModel }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const { ms, lineId } = q.answered!;
  return (
    <li>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className={`${ROW} flex gap-2 py-0.5 text-xs text-[var(--text-muted)]`}
      >
        <s className={`min-w-0 flex-1 ${open ? "" : "truncate"}`}>{q.text}</s>
        {ms !== null ? <span className="shrink-0 tabular-nums">{formatOffset(ms / 1000)}</span> : null}
      </button>
      {open ? (
        <div className="px-2 pb-1">
          {q.en ? (
            <p lang="en" className="pb-1 text-xs text-[var(--text-muted)]">
              {q.en}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-x-3">
            <button type="button" onClick={() => showLine(model.meetingId, lineId)} className={SMALL_LINK}>
              {t("Show the line")}
            </button>
            <button type="button" onClick={() => void model.send({ action: "keep", id: q.id })} className={SMALL_LINK}>
              {t("Keep it")}
            </button>
          </div>
        </div>
      ) : null}
    </li>
  );
}

export function PrepView({ model, boxed = false }: { model: PrepModel; boxed?: boolean }) {
  const t = useT();
  const [draft, setDraft] = useState("");
  const { state, failed, send, enable, ended, working, has, offered } = model;
  const { prep } = state;
  if (!offered) return null;

  const open = prep.questions.filter((q) => !q.answered);
  const answered = prep.questions.filter((q) => q.answered);

  const add = async () => {
    const text = draft.trim();
    if (!text) return;
    if (await send({ action: "add", text })) setDraft("");
  };

  return (
    <section
      aria-label={t("Questions")}
      className={`flex flex-col gap-3 text-sm ${boxed ? "rounded-xl border border-[var(--border)] px-4 py-3" : ""}`}
    >
      <div className="flex items-center gap-3">
        <h2 className="min-w-0 flex-1 font-medium text-[var(--text-strong)]">{t("Questions")}</h2>
        {!ended ? (
          <>
            {!state.enabled ? (
              <span className="text-xs text-[var(--text-secondary)]">{t("Prepare during the recording")}</span>
            ) : null}
            <Switch on={state.enabled} label={t("Prepare during the recording")} onChange={enable} />
          </>
        ) : null}
      </div>

      {state.enabled || ended ? (
        <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
          <span className="min-w-0 flex-1" aria-live="polite">
            {working
              ? state.waiting
                ? t("Waiting for room on the GPU…")
                : t("Updating…")
              : prep.throughMs !== null
                ? t("Up to {time}", { time: formatOffset(prep.throughMs / 1000) })
                : null}
          </span>
          <button
            type="button"
            disabled={working}
            onClick={() => void send({ action: "run" })}
            className="btn-outline !px-2.5 !py-0.5 !text-xs"
          >
            {t("Update now")}
          </button>
        </div>
      ) : null}

      {prep.skipped > 0 ? (
        <p className="text-xs text-[var(--text-secondary)]">
          {t("The last update read only the newest part: {n} earlier lines did not fit.", { n: prep.skipped })}
        </p>
      ) : null}
      {prep.error ? <p className="text-xs text-[var(--warning)]">{t(prep.error)}</p> : null}
      {failed ? <p className="text-xs text-[var(--warning)]">{failed}</p> : null}

      {has || state.enabled ? (
        <>
          {open.length > 0 ? (
            <ul className="-mx-2">
              {open.map((q) => (
                <OpenQuestion
                  key={q.id}
                  q={q}
                  isNew={q.source === "model" && q.run === prep.runs && prep.runs > 1}
                  model={model}
                />
              ))}
            </ul>
          ) : answered.length === 0 ? (
            <p className="text-xs text-[var(--text-secondary)]">
              {t("Questions appear here once enough has been said.")}{" "}
              {t("Updates every 5 minutes on the server, so it carries on with the screen off.")}
            </p>
          ) : null}

          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void add();
            }}
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={`+ ${t("Add your own question")}`}
              aria-label={t("Add your own question")}
              className="min-w-0 flex-1 rounded-md border border-dashed border-[var(--border-strong)] bg-transparent px-2 py-1 text-xs placeholder:text-[var(--text-muted)]"
            />
            {draft.trim() ? (
              <button type="submit" className="btn-outline !px-2.5 !py-0.5 !text-xs">
                {t("Add")}
              </button>
            ) : null}
          </form>

          {answered.length > 0 ? (
            <div>
              <h3 className="text-xs text-[var(--text-muted)]">{t("Answered {n}", { n: answered.length })}</h3>
              <ul className="-mx-2 mt-0.5">
                {answered.map((q) => (
                  <AnsweredQuestion key={q.id} q={q} model={model} />
                ))}
              </ul>
            </div>
          ) : null}

          {prep.summary.length > 0 ? (
            <details className="border-t border-[var(--border)] pt-2">
              <summary className="cursor-pointer text-xs text-[var(--text-muted)]">{t("So far")}</summary>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-[var(--text-secondary)]">
                {prep.summary.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </details>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
