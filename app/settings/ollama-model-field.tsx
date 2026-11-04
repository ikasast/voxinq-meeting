"use client";

import { useCallback, useEffect, useState } from "react";
import { TrashIcon } from "../icons";
import { useT } from "@/app/locale-provider";
import { findInstalled, loadedMb, sameModel, type InstalledModel } from "@/lib/llm/ollama-models";
import { OllamaLibrarySearch } from "./ollama-library-search";

// The Ollama model field, with what the Ollama at that address actually has.
//
// The installed models are the choice, as a list to pick from; a name the list does not have can
// still be typed. For an administrator a name that is not there comes with a Download button,
// which fetches it on the server — the download carries on if this page is closed, and picks up
// its progress when it is opened again. Below, "Add a model" searches ollama.com, and shows
// models to start from until something is searched for.

type Installed = InstalledModel;
/** How a model sat on the card the last time it ran here (lib/llm/model-runs.ts). */
type Run = { name: string; loadedMb: number; gpuMb: number; at: string };
type Pull = {
  status: string;
  completed: number;
  total: number;
  done: boolean;
  error: string | null;
};

const POLL_MS = 1500;

/**
 * Models to start from, smallest first. Ollama's own names, so picking one is all it takes to
 * download it. The GPU column is the card it is comfortable on with a meeting's worth of context
 * (lib/llm/context.ts), not the bare file; the Qwen 3 family leads because it writes Japanese
 * well at every size.
 */
function suggestions(t: (k: string) => string) {
  return [
    { vram: t("No GPU / 6 GB"), model: "qwen3:4b", size: "2.5 GB", note: t("Light. Short, plain minutes.") },
    { vram: "8 GB", model: "qwen3:8b", size: "5.2 GB", note: t("The default. Good minutes for everyday meetings.") },
    { vram: "12 GB", model: "gemma3:12b", size: "8.1 GB", note: t("Smooth writing, in Japanese and English.") },
    { vram: "16 GB", model: "qwen3:14b", size: "9.3 GB", note: t("More careful with long or technical meetings.") },
    { vram: "16 GB", model: "gpt-oss:20b", size: "14 GB", note: t("Strong at sorting out decisions and tasks.") },
    { vram: "24 GB", model: "qwen3:32b", size: "20 GB", note: t("The best of these, for difficult meetings.") },
  ];
}

function gb(bytesOrMb: number, unit: "b" | "mb"): string {
  const mb = unit === "b" ? bytesOrMb / 1024 / 1024 : bytesOrMb;
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`;
}

export function OllamaModelField({
  baseUrl,
  model,
  onChange,
  isAdmin,
  inputClass,
  labelClass,
  onInstalled,
}: {
  baseUrl: string;
  model: string;
  onChange: (next: string) => void;
  isAdmin: boolean;
  inputClass: string;
  labelClass: string;
  /** What this Ollama has, for another model setting to be chosen from (the questions model). */
  onInstalled?: (names: string[]) => void;
}) {
  const t = useT();
  const [installed, setInstalled] = useState<Installed[]>([]);
  const [reachable, setReachable] = useState<boolean | null>(null);
  const [budgetMb, setBudgetMb] = useState<number | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Administrators only: which installed models somebody's minutes depend on, the one waiting
  // for "yes, delete it", and the one being deleted.
  const [inUse, setInUse] = useState<string[]>([]);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  // "Type a name": a name the list does not offer, such as one for another server's naming.
  const [typing, setTyping] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/ollama/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseUrl }),
      });
      const d = (await res.json()) as {
        reachable: boolean;
        models: Installed[];
        budgetMb: number | null;
        inUse?: string[];
        runs?: Run[];
      };
      setReachable(d.reachable);
      setInstalled(d.models);
      onInstalled?.(d.models.map((m) => m.name));
      setBudgetMb(d.budgetMb);
      setInUse(d.inUse ?? []);
      setRuns(d.runs ?? []);
    } catch {
      setReachable(false);
    }
  }, [baseUrl, onInstalled]);

  // The address is typed a character at a time; ask once it has stopped changing.
  useEffect(() => {
    const id = setTimeout(() => void refresh(), 500);
    return () => clearTimeout(id);
  }, [refresh]);

  // Which model and address a download state belongs to. Kept beside it rather than cleared
  // when the field changes, so a state for the name typed a moment ago is simply not shown.
  const target = `${baseUrl}|${model.trim()}`;
  const [tracked, setTracked] = useState<{ target: string; state: Pull | null } | null>(null);
  const pull = tracked?.target === target ? tracked.state : null;

  const fetchStatus = useCallback(async (name: string = model.trim()): Promise<Pull | null> => {
    if (!name) return null;
    const res = await fetch("/api/ollama/pull/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: name, baseUrl }),
    });
    const d = (await res.json()) as { state: Pull | null };
    return d.state;
  }, [model, baseUrl]);

  // A download started earlier — from this page before a reload, or by somebody else — is
  // picked up rather than offered again. Asked once the name has stopped changing.
  useEffect(() => {
    const id = setTimeout(() => {
      void fetchStatus()
        .then((state) => setTracked({ target, state }))
        .catch(() => {});
    }, 300);
    return () => clearTimeout(id);
  }, [fetchStatus, target]);

  // While one is running, ask again every little while. Each answer is a new state, which runs
  // this again — so it stops on its own when the download does.
  useEffect(() => {
    if (!pull || pull.done) return;
    const id = setTimeout(() => {
      void fetchStatus()
        .then(async (state) => {
          setTracked({ target, state });
          // Finished: the list is what says "installed" now.
          if (state?.done && !state.error) await refresh();
        })
        .catch(() => setTracked({ target, state: { ...pull } }));
    }, POLL_MS);
    return () => clearTimeout(id);
  }, [pull, fetchStatus, target, refresh]);

  // By name, because the search below picks a model and downloads it in one go — before this
  // render has caught up with the field holding it.
  const download = async (name: string = model.trim()) => {
    setStarting(true);
    setError(null);
    try {
      const res = await fetch("/api/ollama/pull", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: name, baseUrl }),
      });
      const d = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(d?.error ?? `HTTP ${res.status}`);
      setTracked({ target: `${baseUrl}|${name}`, state: await fetchStatus(name) });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setStarting(false);
    }
  };

  const remove = async (target: string) => {
    setDeleting(target);
    setError(null);
    try {
      const res = await fetch("/api/ollama/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: target, baseUrl }),
      });
      const d = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(d?.error ?? `HTTP ${res.status}`);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDeleting(null);
      setConfirming(null);
    }
  };

  const name = model.trim();
  const hit = name ? findInstalled(installed, name) : null;
  // A fifth on top of the file for the context, as the queue prices it.
  // What it occupies loaded, which is what the budget is about — not the file. Shown beside the
  // file size, because a warning that compares a number it does not print reads as a mistake:
  // "6.1 GB is larger than 7.0 GB" is what the first version of this said.
  const need = hit ? loadedMb(hit.sizeMb) : 0;
  // Once it has run here, what Ollama did with it settles the question the estimate guesses at.
  // Only the share is used: for some models Ollama's own total is far below what the card holds.
  const run = hit && budgetMb !== null ? (runs.find((r) => sameModel(r.name, hit.name)) ?? null) : null;
  const share = run && run.loadedMb > 0 ? Math.round((Math.min(run.gpuMb, run.loadedMb) / run.loadedMb) * 100) : null;
  const tooBig = hit && budgetMb !== null && share === null && need > budgetMb;
  const fit = !hit ? null : share !== null ? (
    share >= 99 ? (
      <p className="text-[var(--success)]">{t("When it last ran here, all of it was on the GPU.")}</p>
    ) : (
      <p className="text-[var(--warning)]">
        {t("When it last ran here, {n}% of it was on the GPU and the rest ran on the CPU, which is slower.", { n: share })}
      </p>
    )
  ) : tooBig ? (
    <p className="text-[var(--warning)]">
      {t(
        "Loaded, it needs about {need}, more than this machine's GPU budget of {budget}. Part of it will run on the CPU, which is much slower.",
        { need: gb(need, "mb"), budget: gb(budgetMb!, "mb") },
      )}{" "}
      {t("This is an estimate from the file; once it has written minutes here, what the card actually held is shown instead.")}
    </p>
  ) : budgetMb !== null ? (
    <p className="text-[var(--text-muted)]">{t("About {need} once loaded", { need: gb(need, "mb") })}</p>
  ) : null;

  // A name that is not on the list -- typed, or one the list does not have yet -- is edited in
  // the box; otherwise the list is the control and the box waits behind "Type a name".
  const typed = typing || reachable === false || installed.length === 0 || (name !== "" && !hit && reachable !== null);

  return (
    <div>
      {/* One place to choose, from what this Ollama has (2026-11-03). It used to be a box with
          the installed models as suggestions, then a search, then suggestions, then the installed
          models again, folded: four things down the page, and nowhere that said which one chose. */}
      {installed.length > 0 ? (
        <ul
          role="radiogroup"
          aria-label={t("Model to use")}
          className="divide-y divide-[var(--border)] rounded-md border border-[var(--border)]"
        >
          {installed.map((m) => {
            const on = sameModel(model, m.name);
            const used = inUse.some((u) => sameModel(u, m.name));
            return (
              <li key={m.name} className={`px-3 py-2 ${on ? "bg-[color-mix(in_srgb,var(--accent)_8%,transparent)]" : ""}`}>
                <div className="flex items-center gap-2">
                  <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5">
                    <input
                      type="radio"
                      name="ollamaModelChoice"
                      checked={on}
                      onChange={() => onChange(m.name)}
                      className="h-4 w-4 shrink-0 accent-[var(--accent-solid)]"
                    />
                    <span className={`min-w-0 truncate font-mono text-sm ${on ? "font-semibold text-[var(--text-strong)]" : "text-[var(--foreground)]"}`}>
                      {m.name}
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-[var(--text-muted)]">{gb(m.sizeMb, "mb")}</span>
                  </label>
                  {used ? (
                    <span
                      className="shrink-0 rounded-full border border-[var(--border-strong)] px-2 py-0.5 text-[11px] text-[var(--text-muted)]"
                      title={t("Minutes are written with this model, for this machine or for somebody on it.")}
                    >
                      {t("In use")}
                    </span>
                  ) : isAdmin && confirming === m.name ? (
                    <span className="flex shrink-0 items-center gap-1.5 text-xs">
                      <button
                        type="button"
                        onClick={() => void remove(m.name)}
                        disabled={deleting !== null}
                        className="rounded-md border border-[color-mix(in_srgb,var(--error)_45%,transparent)] px-2 py-0.5 font-semibold text-[var(--error)] hover:bg-[color-mix(in_srgb,var(--error)_10%,transparent)] disabled:opacity-50"
                      >
                        {deleting === m.name ? t("Deleting…") : t("Delete {size}", { size: gb(m.sizeMb, "mb") })}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirming(null)}
                        disabled={deleting !== null}
                        className="text-[var(--text-muted)] hover:underline"
                      >
                        {t("Cancel")}
                      </button>
                    </span>
                  ) : isAdmin ? (
                    <button
                      type="button"
                      onClick={() => setConfirming(m.name)}
                      disabled={deleting !== null}
                      title={t("Remove {name}", { name: m.name })}
                      aria-label={t("Remove {name}", { name: m.name })}
                      className="shrink-0 rounded p-1 text-[var(--text-muted)] hover:bg-[var(--hover-surface)] hover:text-[var(--error)] disabled:opacity-50"
                    >
                      <TrashIcon className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </div>
                {/* What the chosen one does on this card, under it. */}
                {on && hit ? <div className="mt-1 pl-[1.625rem] text-xs">{fit}</div> : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      {reachable === false ? (
        <p className="mt-1.5 text-xs text-[var(--warning)]">{t("Cannot reach Ollama at this address.")}</p>
      ) : reachable && installed.length === 0 ? (
        <p className="mt-1.5 text-xs text-[var(--text-muted)]">{t("This Ollama has no models yet.")}</p>
      ) : installed.length > 0 ? (
        <p className="mt-1.5 text-xs text-[var(--text-muted)]">
          {isAdmin
            ? t("The models this Ollama has. The bin deletes one.")
            : t("The models this Ollama has. An administrator adds more.")}{" "}
          {!typed ? (
            <button type="button" onClick={() => setTyping(true)} className="text-[var(--accent-sub)] hover:underline">
              {t("Type a name")}
            </button>
          ) : null}
        </p>
      ) : null}

      {typed ? (
        <div className="mt-2">
          <label htmlFor="ollamaModel" className={labelClass}>
            {t("Model name")}
          </label>
          <input
            id="ollamaModel"
            type="text"
            value={model}
            onChange={(e) => onChange(e.target.value)}
            placeholder="qwen3:8b"
            className={inputClass}
            autoComplete="off"
            spellCheck={false}
          />
        </div>
      ) : null}

      <div className="mt-1.5 space-y-1 text-xs" aria-live="polite">
        {!name || reachable !== true || hit ? null : pull && !pull.done ? (
          <div>
            <p className="text-[var(--text-secondary)]">
              {t("Downloading {model}…", { model: name })}{" "}
              <span className="text-[var(--text-muted)]">
                {pull.total > 0
                  ? `${gb(pull.completed, "b")} / ${gb(pull.total, "b")}`
                  : pull.status}
              </span>
            </p>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--border)]">
              <div
                className="h-full bg-[var(--accent)] transition-[width]"
                style={{ width: `${pull.total > 0 ? Math.min(100, (pull.completed / pull.total) * 100) : 5}%` }}
              />
            </div>
            <p className="mt-1 text-[var(--text-muted)]">
              {t("It carries on if you close this page.")}
            </p>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[var(--warning)]">{t("{model} is not installed on this Ollama.", { model: name })}</span>
            {isAdmin ? (
              <button
                type="button"
                onClick={() => void download()}
                disabled={starting}
                className="btn-outline !px-2.5 !py-1 !text-xs"
              >
                {starting ? t("Starting…") : t("Download")}
              </button>
            ) : (
              <span className="text-[var(--text-muted)]">
                {t("An administrator can download it from this screen.")}
              </span>
            )}
          </div>
        )}
        {pull?.error ? (
          <p className="text-[var(--error)]">
            {t("The download failed: {reason}", { reason: pull.error })}
          </p>
        ) : null}
        {error ? <p className="text-[var(--error)]">{error}</p> : null}
      </div>

      {/* Adding one: the search, and before anything is searched for, the models to start from.
          Administrators only, like downloading. */}
      {isAdmin ? (
        <div className="mt-5">
          <p className="flex items-center gap-2 text-sm font-medium text-[var(--text-strong)]">
            {t("Add a model")}
            <span className="rounded-full border border-[var(--border-strong)] px-2 py-0.5 text-[10px] font-normal text-[var(--text-muted)]">
              {t("Administrator")}
            </span>
          </p>
          <OllamaLibrarySearch
            installed={installed}
            runs={runs}
            budgetMb={budgetMb}
            current={model}
            onPick={onChange}
            onDownload={(name) => {
              onChange(name);
              void download(name);
            }}
            downloading={starting || (pull !== null && !pull.done)}
          >
            {/* Which model to start from, by how much memory the card has: the question somebody
                faced with nothing installed actually has. Sizes are the download; loaded, a model
                needs that plus room for the meeting (the context), which the GPU column allows for. */}
            <p className="mb-1 mt-3 text-[var(--text-secondary)]">{t("Models to try, by GPU memory")}</p>
            <ul className="divide-y divide-[var(--border)] overflow-hidden rounded-md border border-[var(--border)] bg-[var(--surface)]">
              {suggestions(t).map((s) => {
                const have = findInstalled(installed, s.model) !== null;
                return (
                  <li key={s.model} className="flex items-center gap-3 px-3 py-2">
                    <span className="min-w-0 flex-1">
                      <span className="block font-mono text-[var(--foreground)]">{s.model}</span>
                      <span className="block text-[var(--text-muted)]">
                        <span className="tabular-nums">{s.vram} · {s.size}</span> · {s.note}
                      </span>
                    </span>
                    {have ? (
                      <span className="shrink-0 rounded-full border border-[var(--border-strong)] px-2 py-0.5 text-[var(--text-muted)]">
                        {t("Installed")}
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          onChange(s.model);
                          void download(s.model);
                        }}
                        disabled={starting || (pull !== null && !pull.done)}
                        className="btn-outline shrink-0 !px-2.5 !py-1 !text-xs"
                      >
                        {t("Add")}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
            <p className="mt-1.5 text-[var(--text-muted)]">
              {t("A guide, not a promise: the memory includes room for a long meeting. Without a GPU, use the smallest, and expect minutes to take several minutes.")}
            </p>
          </OllamaLibrarySearch>
        </div>
      ) : null}
    </div>
  );
}
