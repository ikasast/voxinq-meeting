"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// Per-series defaults: rename the series and set a minutes format / STT glossary that
// override the global settings for every meeting in the series.
export function SeriesSettings({
  id,
  name,
  summaryFormat,
  sttGlossary,
}: {
  id: string;
  name: string;
  summaryFormat: string | null;
  sttGlossary: string | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(name);
  const [draftFormat, setDraftFormat] = useState(summaryFormat ?? "");
  const [draftGlossary, setDraftGlossary] = useState(sttGlossary ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/series/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: draftName.trim(),
          summaryFormat: draftFormat.trim() || null,
          sttGlossary: draftGlossary.trim() || null,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        throw new Error(d?.error ?? `HTTP ${res.status}`);
      }
      setEditing(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setPending(false);
    }
  };

  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="section-title text-lg font-semibold text-[var(--text-strong)]">
          Series defaults
        </h2>
        {!editing ? (
          <button type="button" onClick={() => setEditing(true)} className="btn-outline">
            Edit
          </button>
        ) : null}
      </div>
      <p className="mt-1 text-xs text-[var(--text-muted)]">
        Apply to every meeting in this series, overriding the global Settings.
      </p>

      {editing ? (
        <div className="mt-3 space-y-3">
          <div>
            <label htmlFor="series-name" className="label">
              Series name
            </label>
            <input
              id="series-name"
              type="text"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              maxLength={60}
              disabled={pending}
              className="input mt-1 max-w-sm"
            />
          </div>
          <div>
            <label htmlFor="series-format" className="label">
              Minutes format (empty = use the global setting)
            </label>
            <textarea
              id="series-format"
              value={draftFormat}
              onChange={(e) => setDraftFormat(e.target.value)}
              rows={6}
              disabled={pending}
              placeholder={"## Summary\n…heading structure the minutes must follow for this series"}
              className="input mt-1 resize-y font-mono text-xs"
            />
          </div>
          <div>
            <label htmlFor="series-glossary" className="label">
              Transcription glossary (appended to the global glossary)
            </label>
            <textarea
              id="series-glossary"
              value={draftGlossary}
              onChange={(e) => setDraftGlossary(e.target.value)}
              rows={2}
              disabled={pending}
              placeholder="Terms and proper nouns that come up in this series"
              className="input mt-1 resize-y"
            />
          </div>
          {error ? <p className="text-sm text-[var(--error)]">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setDraftName(name);
                setDraftFormat(summaryFormat ?? "");
                setDraftGlossary(sttGlossary ?? "");
                setError(null);
                setEditing(false);
              }}
              disabled={pending}
              className="btn-outline"
            >
              Cancel
            </button>
            <button type="button" onClick={save} disabled={pending} className="btn-ink">
              {pending ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      ) : (
        <dl className="mt-3 space-y-2 text-sm">
          <div>
            <dt className="text-xs text-[var(--text-muted)]">Minutes format</dt>
            <dd className="text-[var(--text-secondary)]">
              {summaryFormat ? (
                <pre className="mt-1 whitespace-pre-wrap rounded-md border border-[var(--border)] bg-[var(--elevated)] p-2 font-mono text-xs">
                  {summaryFormat}
                </pre>
              ) : (
                "Global setting"
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--text-muted)]">Transcription glossary</dt>
            <dd className="text-[var(--text-secondary)]">{sttGlossary || "Global setting"}</dd>
          </div>
        </dl>
      )}
    </section>
  );
}
