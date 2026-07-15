"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

// Section to edit the meeting's contents/purpose (description), tags, and series afterward.
// description feeds the minutes-generation prompt; tags are used for list display/filtering.
// series links recurring meetings: the previous one's minutes become LLM reference context.
export function MeetingMeta({
  id,
  description,
  tags,
  series,
  seriesId,
}: {
  id: string;
  description: string | null;
  tags: string[];
  series: string | null;
  seriesId: string | null;
}) {
  const router = useRouter();
  const [savedDesc, setSavedDesc] = useState(description ?? "");
  const [savedTags, setSavedTags] = useState(tags);
  const [savedSeries, setSavedSeries] = useState(series ?? "");
  const [draftDesc, setDraftDesc] = useState(description ?? "");
  const [draftTags, setDraftTags] = useState(tags);
  const [draftSeries, setDraftSeries] = useState(series ?? "");
  const [tagInput, setTagInput] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [seriesOptions, setSeriesOptions] = useState<string[]>([]);
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // When opening the editor, offer existing tags/series as suggestions.
  useEffect(() => {
    if (!editing) return;
    let cancelled = false;
    fetch("/api/tags")
      .then((r) => (r.ok ? r.json() : null))
      .then((list: { name: string }[] | null) => {
        if (!cancelled && list) setSuggestions(list.map((t) => t.name));
      })
      .catch(() => {});
    fetch("/api/series")
      .then((r) => (r.ok ? r.json() : null))
      .then((list: { name: string }[] | null) => {
        if (!cancelled && list) setSeriesOptions(list.map((s) => s.name));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [editing]);

  const cancel = () => {
    setDraftDesc(savedDesc);
    setDraftTags(savedTags);
    setDraftSeries(savedSeries);
    setTagInput("");
    setError(null);
    setEditing(false);
  };

  const addTag = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed || draftTags.includes(trimmed)) return;
    setDraftTags((prev) => [...prev, trimmed]);
    setTagInput("");
  };

  const removeTag = (name: string) => {
    setDraftTags((prev) => prev.filter((t) => t !== name));
  };

  const save = async () => {
    setPending(true);
    setError(null);
    // Pick up a half-typed tag left in the input.
    const finalTags = tagInput.trim() && !draftTags.includes(tagInput.trim())
      ? [...draftTags, tagInput.trim()]
      : draftTags;
    try {
      const res = await fetch(`/api/meetings/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: draftDesc.trim(),
          tags: finalTags,
          series: draftSeries.trim() || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? `HTTP ${res.status}`);
      }
      const updated = (await res.json()) as { tags: string[]; series: string | null };
      setSavedDesc(draftDesc.trim());
      setSavedTags(updated.tags);
      setDraftTags(updated.tags);
      setSavedSeries(updated.series ?? "");
      setDraftSeries(updated.series ?? "");
      setTagInput("");
      setEditing(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setPending(false);
    }
  };

  const unusedSuggestions = suggestions.filter((s) => !draftTags.includes(s));

  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="section-title text-lg font-semibold text-[var(--text-strong)]">
          Purpose &amp; agenda
        </h2>
        {!editing ? (
          <button type="button" onClick={() => setEditing(true)} className="btn-outline">
            Edit
          </button>
        ) : null}
      </div>

      {editing ? (
        <div className="mt-3 space-y-3">
          <textarea
            value={draftDesc}
            onChange={(e) => setDraftDesc(e.target.value)}
            placeholder="Purpose, agenda, and background of the meeting. Improves minutes quality."
            rows={4}
            autoFocus
            disabled={pending}
            className="input resize-y"
          />

          <div>
            <p className="label">Tags</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {draftTags.map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center gap-1 rounded-full border border-[var(--border-strong)] bg-[var(--elevated)] px-2.5 py-0.5 text-xs text-[var(--text-secondary)]"
                >
                  {t}
                  <button
                    type="button"
                    onClick={() => removeTag(t)}
                    aria-label={`Remove tag ${t}`}
                    className="text-[var(--text-muted)] hover:text-[var(--error)]"
                  >
                    ×
                  </button>
                </span>
              ))}
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    addTag(tagInput);
                  }
                }}
                placeholder="Type a tag and press Enter"
                maxLength={30}
                disabled={pending}
                className="w-44 rounded-md border border-[var(--border-strong)] bg-[var(--elevated)] px-2 py-1 text-xs text-[var(--foreground)] focus:border-[var(--accent)] focus:outline-none"
              />
            </div>
            {unusedSuggestions.length > 0 ? (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] text-[var(--text-muted)]">Existing:</span>
                {unusedSuggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => addTag(s)}
                    className="rounded-full border border-dashed border-[var(--border-strong)] px-2.5 py-0.5 text-xs text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--accent-sub)]"
                  >
                    + {s}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div>
            <label htmlFor="series" className="label">
              Series (recurring meetings)
            </label>
            <input
              id="series"
              type="text"
              list="series-options"
              value={draftSeries}
              onChange={(e) => setDraftSeries(e.target.value)}
              placeholder="e.g. Weekly sync (empty = none)"
              maxLength={60}
              disabled={pending}
              className="input mt-1"
            />
            <datalist id="series-options">
              {seriesOptions.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Meetings in the same series share context: the previous meeting&apos;s minutes are
              given to the LLM as reference when generating minutes.
            </p>
          </div>

          {error ? <p className="text-sm text-[var(--error)]">{error}</p> : null}
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
        <>
          {savedDesc ? (
            <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--text-secondary)]">
              {savedDesc}
            </p>
          ) : (
            <p className="mt-2 text-sm text-[var(--text-muted)]">Not set</p>
          )}
          {savedTags.length > 0 || savedSeries ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {savedSeries ? (
                seriesId && savedSeries === (series ?? "") ? (
                  <Link
                    href={`/series/${seriesId}`}
                    title="Open the series page (timeline & defaults)"
                    className="rounded-full border border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] px-2.5 py-0.5 text-xs text-[var(--accent-sub)] hover:underline"
                  >
                    ↻ {savedSeries}
                  </Link>
                ) : (
                  <span className="rounded-full border border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] px-2.5 py-0.5 text-xs text-[var(--accent-sub)]">
                    ↻ {savedSeries}
                  </span>
                )
              ) : null}
              {savedTags.map((t) => (
                <span
                  key={t}
                  className="rounded-full border border-[var(--border-strong)] bg-[var(--elevated)] px-2.5 py-0.5 text-xs text-[var(--text-secondary)]"
                >
                  {t}
                </span>
              ))}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
