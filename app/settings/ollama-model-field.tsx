"use client";

import { useCallback, useEffect, useState } from "react";
import { useT } from "@/app/locale-provider";
import { findInstalled, loadedMb, sameModel, type InstalledModel } from "@/lib/llm/ollama-models";

// The Ollama model field, with what the Ollama at that address actually has.
//
// Installed models are offered as suggestions, so the usual case is picking rather than
// typing; and the field says whether the name typed is there. For an administrator a name
// that is not there comes with a Download button, which fetches it on the server — the
// download carries on if this page is closed, and picks up its progress when it is opened
// again.

type Installed = InstalledModel;
type Pull = {
  status: string;
  completed: number;
  total: number;
  done: boolean;
  error: string | null;
};

const POLL_MS = 1500;

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
}: {
  baseUrl: string;
  model: string;
  onChange: (next: string) => void;
  isAdmin: boolean;
  inputClass: string;
  labelClass: string;
}) {
  const t = useT();
  const [installed, setInstalled] = useState<Installed[]>([]);
  const [reachable, setReachable] = useState<boolean | null>(null);
  const [budgetMb, setBudgetMb] = useState<number | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Administrators only: which installed models somebody's minutes depend on, the one waiting
  // for "yes, delete it", and the one being deleted.
  const [inUse, setInUse] = useState<string[]>([]);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

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
      };
      setReachable(d.reachable);
      setInstalled(d.models);
      setBudgetMb(d.budgetMb);
      setInUse(d.inUse ?? []);
    } catch {
      setReachable(false);
    }
  }, [baseUrl]);

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

  const fetchStatus = useCallback(async (): Promise<Pull | null> => {
    const name = model.trim();
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

  const download = async () => {
    setStarting(true);
    setError(null);
    try {
      const res = await fetch("/api/ollama/pull", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: model.trim(), baseUrl }),
      });
      const d = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(d?.error ?? `HTTP ${res.status}`);
      setTracked({ target, state: await fetchStatus() });
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
  const tooBig = hit && budgetMb !== null && need > budgetMb;

  return (
    <div>
      <label htmlFor="ollamaModel" className={labelClass}>
        {t("Model")}
      </label>
      <input
        id="ollamaModel"
        type="text"
        list="ollama-installed"
        value={model}
        onChange={(e) => onChange(e.target.value)}
        placeholder="qwen3:8b"
        className={inputClass}
        autoComplete="off"
        spellCheck={false}
      />
      <datalist id="ollama-installed">
        {installed.map((m) => (
          <option key={m.name} value={m.name}>
            {gb(m.sizeMb, "mb")}
          </option>
        ))}
      </datalist>

      <div className="mt-1.5 space-y-1 text-xs" aria-live="polite">
        {reachable === false ? (
          <p className="text-[var(--warning)]">{t("Cannot reach Ollama at this address.")}</p>
        ) : !name || reachable === null ? null : pull && !pull.done ? (
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
        ) : hit ? (
          <>
            <p className="text-[var(--accent-sub)]">
              {budgetMb !== null
                ? t("Installed · {size} file, about {need} once loaded", {
                    size: gb(hit.sizeMb, "mb"),
                    need: gb(need, "mb"),
                  })
                : t("Installed · {size}", { size: gb(hit.sizeMb, "mb") })}
            </p>
            {tooBig ? (
              <p className="text-[var(--warning)]">
                {t(
                  "Loaded, it needs about {need}, more than this machine's GPU budget of {budget}. Part of it will run on the CPU, which is much slower.",
                  { need: gb(need, "mb"), budget: gb(budgetMb!, "mb") },
                )}
              </p>
            ) : null}
          </>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[var(--text-muted)]">{t("Not installed on this Ollama.")}</span>
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

      {/* What is on the disk, to give some of it back. Only for whoever can delete; for
          everybody else the suggestions in the field are the list. */}
      {isAdmin && installed.length > 0 ? (
        <details className="mt-3 text-xs">
          <summary className="cursor-pointer text-[var(--text-secondary)]">
            {t("Installed models ({n})", { n: installed.length })}
          </summary>
          <ul className="mt-2 divide-y divide-[var(--border)] rounded-md border border-[var(--border)] bg-[var(--surface)]">
            {installed.map((m) => {
              const used = inUse.some((u) => sameModel(u, m.name));
              return (
                <li key={m.name} className="flex flex-wrap items-center gap-2 px-3 py-2">
                  {/* Picking it is the other thing somebody looking at this list wants. */}
                  <button
                    type="button"
                    onClick={() => onChange(m.name)}
                    className="min-w-0 flex-1 truncate text-left text-[var(--foreground)] hover:underline"
                    title={t("Use this model")}
                  >
                    {m.name}
                  </button>
                  <span className="shrink-0 text-[var(--text-muted)]">{gb(m.sizeMb, "mb")}</span>
                  {used ? (
                    <span
                      className="shrink-0 rounded-full border border-[var(--border-strong)] px-2 py-0.5 text-[var(--text-muted)]"
                      title={t("Minutes are written with this model, for this machine or for somebody on it.")}
                    >
                      {t("In use")}
                    </span>
                  ) : confirming === m.name ? (
                    <span className="flex shrink-0 items-center gap-1.5">
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
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirming(m.name)}
                      disabled={deleting !== null}
                      className="shrink-0 text-[var(--text-muted)] hover:text-[var(--error)] disabled:opacity-50"
                    >
                      {t("Delete")}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
