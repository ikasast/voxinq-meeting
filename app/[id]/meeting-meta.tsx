"use client";

import Link from "next/link";
import { PencilIcon, SeriesIcon } from "@/app/icons";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useT } from "@/app/locale-provider";
import { useExtensions } from "@/app/extensions-provider";
import { PROP_BUTTON, PROPS_WIDE, Prop } from "./property";

// Section to edit the meeting's purpose (description) and series afterward. The description
// feeds the minutes-generation prompt; the series links recurring meetings: the previous one's
// minutes become LLM reference context. (Tags were removed in v4.)
//
// Rows of the meeting's details (property.tsx) — series, purpose — and the one editor for both,
// opened in their place from the purpose's pencil.
export function MeetingMeta({
  id,
  description,
  series,
  seriesId,
  readOnly = false,
}: {
  id: string;
  description: string | null;
  series: string | null;
  seriesId: string | null;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [savedDesc, setSavedDesc] = useState(description ?? "");
  const t = useT();
  const seriesOn = useExtensions().series;
  const [savedSeries, setSavedSeries] = useState(series ?? "");
  const [draftDesc, setDraftDesc] = useState(description ?? "");
  const [draftSeries, setDraftSeries] = useState(series ?? "");
  const [seriesOptions, setSeriesOptions] = useState<string[]>([]);
  const [editing, setEditing] = useState(false);
  // A long agenda shows its first lines until it is clicked.
  const [whole, setWhole] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // When opening the editor, offer the existing series as suggestions.
  useEffect(() => {
    if (!editing) return;
    let cancelled = false;
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
    setDraftSeries(savedSeries);
    setError(null);
    setEditing(false);
  };

  const save = async () => {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/meetings/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: draftDesc.trim(),
          // Not sent without Series: the field is not shown, and an empty one would detach it.
          ...(seriesOn ? { series: draftSeries.trim() || null } : {}),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? `HTTP ${res.status}`);
      }
      const updated = (await res.json()) as { series: string | null };
      setSavedDesc(draftDesc.trim());
      setSavedSeries(updated.series ?? "");
      setDraftSeries(updated.series ?? "");
      setEditing(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("Failed to save"));
    } finally {
      setPending(false);
    }
  };

  if (editing) {
    return (
      <div className={`${PROPS_WIDE} space-y-3 border-y border-[var(--border)] py-3`}>
        <p className="text-sm font-medium text-[var(--text-strong)]">{t("Purpose & agenda")}</p>
        <textarea
          value={draftDesc}
          onChange={(e) => setDraftDesc(e.target.value)}
          placeholder={t("Purpose, agenda, and background of the meeting. Improves minutes quality.")}
          rows={4}
          autoFocus
          disabled={pending}
          className="input resize-y"
        />

        {seriesOn ? (
        <div>
          <label htmlFor="series" className="label">
            {t("Series (recurring meetings)")}
          </label>
          <input
            id="series"
            type="text"
            list="series-options"
            value={draftSeries}
            onChange={(e) => setDraftSeries(e.target.value)}
            placeholder={t("e.g. Weekly sync (empty = none)")}
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
            {t(
              "Meetings in the same series share context: the previous meeting’s minutes are given to the LLM as reference when generating minutes.",
            )}
          </p>
        </div>
        ) : null}

        {error ? <p className="text-sm text-[var(--error)]">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={cancel} disabled={pending} className="btn-outline">
            {t("Cancel")}
          </button>
          <button type="button" onClick={save} disabled={pending} className="btn-ink">
            {pending ? t("Saving…") : t("Save")}
          </button>
        </div>
      </div>
    );
  }

  const linked = seriesId && savedSeries === (series ?? "");
  return (
    <>
      {seriesOn && savedSeries ? (
        <Prop label={t("Series")}>
          {linked ? (
            <Link
              href={`/series/${seriesId}`}
              title={t("Open the series page (timeline & defaults)")}
              className="inline-flex items-center gap-1 text-[var(--accent-sub)] hover:underline"
            >
              <SeriesIcon className="h-3.5 w-3.5 shrink-0 self-center" />
              {savedSeries}
            </Link>
          ) : (
            <span className="inline-flex items-center gap-1 text-[var(--accent-sub)]">
              <SeriesIcon className="h-3.5 w-3.5 shrink-0 self-center" />
              {savedSeries}
            </span>
          )}
        </Prop>
      ) : null}
      <Prop
        label={t("Purpose")}
        action={
          !readOnly ? (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className={PROP_BUTTON}
              title={t("Edit the purpose and agenda")}
              aria-label={t("Edit the purpose and agenda")}
            >
              <PencilIcon className="h-3.5 w-3.5" />
            </button>
          ) : null
        }
      >
        {savedDesc ? (
          <p
            onClick={() => setWhole((v) => !v)}
            className={`cursor-default whitespace-pre-wrap text-[var(--text-secondary)] ${whole ? "" : "line-clamp-3"}`}
          >
            {savedDesc}
          </p>
        ) : (
          <span className="text-[var(--text-muted)]">{t("Not set")}</span>
        )}
      </Prop>
    </>
  );
}
