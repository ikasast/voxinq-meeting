"use client";

import { useState } from "react";
import { useT } from "@/app/locale-provider";
import { fitFor, type Fit, type LibraryError, type LibraryModel, type LibraryTag } from "@/lib/llm/ollama-library";
import { findInstalled, type InstalledModel } from "@/lib/llm/ollama-models";

// Finding a model to download by part of its name, below the model field.
//
// The field takes Ollama's exact name, and nobody knows that `gemma4:e4b` is how "Gemma 4, the
// 4B one" is spelled until they have looked it up. This looks it up: a search on ollama.com, then
// the chosen model's sizes, each marked with whether it sits on this machine's card. Picking one
// fills the field; Download fetches it.
//
// Administrators only, like downloading, and asked only when they press Search.

type Run = { name: string; loadedMb: number; gpuMb: number };

function gb(mb: number): string {
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`;
}

const FIT_CLASS: Record<Fit, string> = {
  fits: "border-[color-mix(in_srgb,var(--success)_45%,transparent)] text-[var(--success)]",
  tight: "border-[color-mix(in_srgb,var(--warning)_45%,transparent)] text-[var(--warning)]",
  partial: "border-[color-mix(in_srgb,var(--warning)_45%,transparent)] text-[var(--warning)]",
  "too-big": "border-[color-mix(in_srgb,var(--error)_45%,transparent)] text-[var(--error)]",
};

export function OllamaLibrarySearch({
  installed,
  runs,
  budgetMb,
  current,
  onPick,
  onDownload,
  downloading,
}: {
  installed: InstalledModel[];
  runs: Run[];
  /** This machine's GPU budget; null when the Ollama is elsewhere and the card is not ours to judge. */
  budgetMb: number | null;
  current: string;
  onPick: (name: string) => void;
  onDownload: (name: string) => void;
  downloading: boolean;
}) {
  const t = useT();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<LibraryError | null>(null);
  const [models, setModels] = useState<LibraryModel[] | null>(null);
  const [searched, setSearched] = useState("");
  const [chosen, setChosen] = useState<string | null>(null);
  const [tags, setTags] = useState<LibraryTag[] | null>(null);
  const [showAll, setShowAll] = useState(false);

  const ask = async (body: { q: string } | { model: string }) => {
    const res = await fetch("/api/ollama/library", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = (await res.json().catch(() => null)) as
      | { failed?: LibraryError; models?: LibraryModel[]; tags?: LibraryTag[]; error?: string }
      | null;
    if (!res.ok) throw new Error(d?.error ?? `HTTP ${res.status}`);
    return d ?? {};
  };

  const search = async () => {
    const query = q.trim();
    if (!query) return;
    setBusy(true);
    setFailed(null);
    setChosen(null);
    setTags(null);
    try {
      const d = await ask({ q: query });
      setSearched(query);
      if (d.failed) {
        setFailed(d.failed);
        setModels(null);
      } else {
        setModels(d.models ?? []);
      }
    } catch {
      setFailed("unreachable");
    } finally {
      setBusy(false);
    }
  };

  const choose = async (name: string) => {
    setChosen(name);
    setTags(null);
    setShowAll(false);
    setBusy(true);
    setFailed(null);
    try {
      const d = await ask({ model: name });
      if (d.failed) setFailed(d.failed);
      else setTags(d.tags ?? []);
    } catch {
      setFailed("unreachable");
    } finally {
      setBusy(false);
    }
  };

  // What the card says about a size: what it did when it ran here, if it has; otherwise the
  // estimate from the download.
  const verdict = (tag: LibraryTag): { label: string; cls: string } | null => {
    const run = runs.find((r) => findInstalled([{ name: r.name, sizeMb: 0 }], tag.name));
    if (run && run.loadedMb > 0) {
      const share = Math.round((Math.min(run.gpuMb, run.loadedMb) / run.loadedMb) * 100);
      return share >= 99
        ? { label: t("Fits on the GPU (measured)"), cls: FIT_CLASS.fits }
        : { label: t("{n}% on the GPU (measured)", { n: share }), cls: FIT_CLASS.partial };
    }
    if (budgetMb === null) return null;
    const fit = fitFor(tag.sizeMb, budgetMb);
    const label = {
      fits: t("Should fit on the GPU"),
      tight: t("Only just"),
      partial: t("Partly on the CPU — slow"),
      "too-big": t("Too big"),
    }[fit];
    return { label, cls: FIT_CLASS[fit] };
  };

  const main = tags?.filter((x) => x.main) ?? [];
  const others = tags?.filter((x) => !x.main) ?? [];
  const shown = showAll ? [...main, ...others] : main.length > 0 ? main : others;
  const picked = tags?.find((x) => x.name === current.trim()) ?? null;
  const pickedInstalled = picked ? findInstalled(installed, picked.name) !== null : false;

  return (
    <div className="mt-3 text-xs">
      <label htmlFor="ollamaSearch" className="mb-1 block text-[var(--text-secondary)]">
        {t("Find a model on ollama.com")}
      </label>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        <input
          id="ollamaSearch"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="gemma4"
          autoComplete="off"
          spellCheck={false}
          className="min-w-0 flex-1 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm text-[var(--foreground)]"
        />
        <button type="submit" disabled={busy || !q.trim()} className="btn-outline !px-3 !py-1 !text-xs">
          {busy && !chosen ? t("Searching…") : t("Search")}
        </button>
      </form>
      <p className="mt-1 text-[var(--text-muted)]">
        {t("Searches ollama.com for part of a name, when you press Search. Only Ollama's own models are listed; any other name can still be typed above.")}
      </p>

      {failed === "unreachable" ? (
        <p className="mt-2 text-[var(--warning)]">
          {t("Cannot reach ollama.com. A server kept off the internet cannot search or download models; the ones already installed can still be chosen above.")}
        </p>
      ) : failed === "unreadable" ? (
        <p className="mt-2 text-[var(--warning)]">
          {t("ollama.com answered, but not in a form this screen can read — its pages may have changed. Type the model's name above instead.")}
        </p>
      ) : null}

      {models && models.length === 0 ? (
        <p className="mt-2 text-[var(--text-muted)]">{t("No model matches “{q}”.", { q: searched })}</p>
      ) : null}

      {models && models.length > 0 ? (
        <ul className="mt-2 divide-y divide-[var(--border)] overflow-hidden rounded-md border border-[var(--border)] bg-[var(--surface)]">
          {models.map((m) => (
            <li key={m.name}>
              <button
                type="button"
                onClick={() => void choose(m.name)}
                aria-pressed={chosen === m.name}
                className={`flex w-full flex-wrap items-start gap-x-3 gap-y-1 px-3 py-2 text-left hover:bg-[var(--hover-surface)] ${chosen === m.name ? "bg-[var(--hover-surface)]" : ""}`}
              >
                {/* At least this wide before the sizes beside it go to the next line: a name cut
                    to "g…" is no help in choosing. */}
                <span className="min-w-0 flex-1 basis-40">
                  <span className="block font-medium text-[var(--foreground)]">{m.name}</span>
                  {m.description ? (
                    <span className="block truncate text-[var(--text-muted)]" title={m.description}>
                      {m.description}
                    </span>
                  ) : null}
                </span>
                <span className="rounded-full border border-[var(--border-strong)] px-2 py-0.5 text-[var(--text-secondary)]">
                  {m.sizes.join(" · ")}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {chosen && busy ? <p className="mt-2 text-[var(--text-muted)]">{t("Reading the sizes of {model}…", { model: chosen })}</p> : null}

      {chosen && tags ? (
        <div className="mt-3">
          <p className="mb-1 text-[var(--text-secondary)]">
            {budgetMb !== null
              ? t("Sizes of {model}, against this machine's GPU budget of {budget}", { model: chosen, budget: gb(budgetMb) })
              : t("Sizes of {model}", { model: chosen })}
          </p>
          <ul className="divide-y divide-[var(--border)] overflow-hidden rounded-md border border-[var(--border)] bg-[var(--surface)]">
            {shown.map((tag) => {
              const v = verdict(tag);
              const have = findInstalled(installed, tag.name) !== null;
              const on = current.trim() === tag.name;
              return (
                <li key={tag.name}>
                  <button
                    type="button"
                    onClick={() => onPick(tag.name)}
                    aria-pressed={on}
                    className={`flex w-full flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2 text-left hover:bg-[var(--hover-surface)] ${on ? "bg-[var(--hover-surface)]" : ""}`}
                  >
                    <span className={`min-w-0 flex-1 basis-40 break-all font-mono ${on ? "font-semibold text-[var(--accent-sub)]" : "text-[var(--foreground)]"}`}>
                      {tag.name}
                    </span>
                    {have ? (
                      <span className="shrink-0 rounded-full border border-[var(--border-strong)] px-2 py-0.5 text-[var(--text-muted)]">
                        {t("Installed")}
                      </span>
                    ) : null}
                    <span className="shrink-0 tabular-nums text-[var(--text-muted)]">{gb(tag.sizeMb)}</span>
                    {v ? <span className={`shrink-0 rounded-full border px-2 py-0.5 ${v.cls}`}>{v.label}</span> : null}
                  </button>
                </li>
              );
            })}
            {!showAll && main.length > 0 && others.length > 0 ? (
              <li>
                <button
                  type="button"
                  onClick={() => setShowAll(true)}
                  className="w-full px-3 py-2 text-center text-[var(--text-secondary)] hover:bg-[var(--hover-surface)]"
                >
                  {t("Other quantisations ({n})", { n: others.length })}
                </button>
              </li>
            ) : null}
          </ul>
          <p className="mt-1 text-[var(--text-muted)]">
            {t("Sizes are the download. Whether it fits is an estimate until the model has run here once; after that, it is what the card held.")}
          </p>

          {picked ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="break-all font-mono font-semibold text-[var(--foreground)]">{picked.name}</span>
              {pickedInstalled ? (
                <span className="text-[var(--text-muted)]">{t("Installed — it is in the field above, ready to save.")}</span>
              ) : (
                <button
                  type="button"
                  onClick={() => onDownload(picked.name)}
                  disabled={downloading}
                  className="btn-outline !px-2.5 !py-1 !text-xs"
                >
                  {t("Download ({size})", { size: gb(picked.sizeMb) })}
                </button>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
