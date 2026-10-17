"use client";

import Link from "next/link";
import { PencilIcon, SeriesIcon } from "@/app/icons";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useT } from "@/app/locale-provider";
import { useExtensions } from "@/app/extensions-provider";
import { PROP_BUTTON, PROPS_WIDE, Prop } from "./property";

// The meeting's series and purpose, as rows of its details (property.tsx), each with its own
// pencil that opens its editor in the row's place. The purpose feeds the minutes prompt; the
// series links recurring meetings, whose previous minutes become the LLM's reference. (Tags
// were removed in v4.)
//
// The series used to be edited from the purpose's pencil, inside one form for both, and its row
// was shown only once there was a series, so a meeting without one gave no hint that it could
// have one (mockup 4, 2026-10-17).
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
  const t = useT();
  const seriesOn = useExtensions().series;
  const [savedDesc, setSavedDesc] = useState(description ?? "");
  const [savedSeries, setSavedSeries] = useState(series ?? "");
  const [draftDesc, setDraftDesc] = useState(description ?? "");
  const [draftSeries, setDraftSeries] = useState(series ?? "");
  const [seriesOptions, setSeriesOptions] = useState<string[]>([]);
  const [editing, setEditing] = useState<"none" | "series" | "purpose">("none");
  // A long agenda shows its first lines until it is clicked.
  const [whole, setWhole] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // When the series editor opens, offer the existing series.
  useEffect(() => {
    if (editing !== "series") return;
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
    setEditing("none");
  };

  // Each editor sends only its own field; the other is left as it is.
  const save = async (body: { description: string } | { series: string | null }) => {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/meetings/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? `HTTP ${res.status}`);
      }
      const updated = (await res.json()) as { series: string | null };
      if ("description" in body) setSavedDesc(body.description);
      setSavedSeries(updated.series ?? "");
      setDraftSeries(updated.series ?? "");
      setEditing("none");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("Failed to save"));
    } finally {
      setPending(false);
    }
  };

  const buttons = (onSave: () => void) => (
    <>
      {error ? <p className="text-sm text-[var(--error)]">{error}</p> : null}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={cancel} disabled={pending} className="btn-outline">
          {t("Cancel")}
        </button>
        <button type="button" onClick={onSave} disabled={pending} className="btn-ink">
          {pending ? t("Saving…") : t("Save")}
        </button>
      </div>
    </>
  );

  const pencil = (what: "series" | "purpose", label: string) =>
    !readOnly ? (
      <button type="button" onClick={() => setEditing(what)} className={PROP_BUTTON} title={label} aria-label={label}>
        <PencilIcon className="h-3.5 w-3.5" />
      </button>
    ) : null;

  const linked = seriesId && savedSeries === (series ?? "");
  const choices = seriesOptions.filter((n) => n !== draftSeries.trim());
  const saveSeries = () => void save({ series: draftSeries.trim() || null });

  const seriesRow = !seriesOn ? null : editing === "series" ? (
    <div className={`${PROPS_WIDE} space-y-2 border-y border-[var(--border)] py-3`}>
      <label htmlFor="series" className="block text-sm font-medium text-[var(--text-strong)]">
        {t("Series (recurring meetings)")}
      </label>
      <input
        id="series"
        type="text"
        value={draftSeries}
        onChange={(e) => setDraftSeries(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") saveSeries();
          if (e.key === "Escape") cancel();
        }}
        placeholder={t("e.g. Weekly sync")}
        maxLength={60}
        autoFocus
        disabled={pending}
        className="input"
      />
      {choices.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {choices.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setDraftSeries(n)}
              className="rounded-full border border-[var(--border-strong)] px-2.5 py-0.5 text-xs text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent-sub)]"
            >
              {n}
            </button>
          ))}
        </div>
      ) : null}
      <p className="text-xs text-[var(--text-muted)]">
        {t("Leave it empty to take the meeting out of its series. A new name starts a new series.")}{" "}
        {t(
          "Meetings in the same series share context: the previous meeting’s minutes are given to the LLM as reference when generating minutes.",
        )}
      </p>
      {buttons(saveSeries)}
    </div>
  ) : (
    <Prop label={t("Series")} action={pencil("series", t("Change the series"))}>
      {!savedSeries ? (
        <span className="text-[var(--text-muted)]">{t("None")}</span>
      ) : linked ? (
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
  );

  const purposeRow =
    editing === "purpose" ? (
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
        {buttons(() => void save({ description: draftDesc.trim() }))}
      </div>
    ) : (
      <Prop label={t("Purpose")} action={pencil("purpose", t("Edit the purpose and agenda"))}>
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
    );

  return (
    <>
      {seriesRow}
      {purposeRow}
    </>
  );
}
