"use client";

import { useState } from "react";
import { useT } from "@/app/locale-provider";
import { CloseIcon } from "../icons";
import { defaultCriteria, MAX_CRITERIA, type ReviewCriterion, type ReviewRole } from "@/lib/review/criteria";

// Settings → Feedback: what a good meeting looks like, as the criteria a review scores against —
// one list for the facilitator, one for a participant. Saved like every other setting on this
// page, a moment after the last change.
//
// An empty list in the settings means "the built-in criteria", which are shown here as the list
// to start from: editing any of it saves the whole list as this person's own, and "Back to the
// built-in criteria" empties it again.
//
// Each criterion's weight is chosen as an importance — Critical, Important, Normal (3, 2, 1) —
// in red, amber and green (mockup 7, 2026-10-17). It was a choice of ●●● / ●●○ / ●○○ labelled
// "Weight", which said neither what it weighed nor by how much.

/** The weights, as the importance each is chosen by. The colour is for the one chosen. */
const IMPORTANCE = [
  {
    weight: 3,
    on: "bg-[color-mix(in_srgb,var(--error)_12%,transparent)] font-semibold text-[var(--error)]",
    dot: "bg-[var(--error)]",
  },
  {
    weight: 2,
    on: "bg-[color-mix(in_srgb,var(--warning)_14%,transparent)] font-semibold text-[var(--warning)]",
    dot: "bg-[var(--warning)]",
  },
  {
    weight: 1,
    on: "bg-[color-mix(in_srgb,var(--success)_14%,transparent)] font-semibold text-[var(--success)]",
    dot: "bg-[var(--success)]",
  },
] as const;

export function ReviewCriteriaEditor({
  role,
  value,
  language,
  onChange,
}: {
  role: ReviewRole;
  value: ReviewCriterion[];
  /** The minutes' language, which the built-in criteria and the feedback are written in. */
  language: "ja" | "en";
  onChange: (next: ReviewCriterion[]) => void;
}) {
  const t = useT();
  const own = value.length > 0;
  const list = own ? value : defaultCriteria(role, language);
  const [adding, setAdding] = useState(0);

  // Spelled out one by one, so the translation check can see each.
  const label: Record<3 | 2 | 1, string> = { 3: t("Critical"), 2: t("Important"), 1: t("Normal") };
  const set = (i: number, patch: Partial<ReviewCriterion>) => onChange(list.map((c, j) => (j === i ? { ...c, ...patch } : c)));

  return (
    <div className="space-y-1">
      <ul className="divide-y divide-dashed divide-[var(--border)]">
        {list.map((c, i) => (
          <li key={`${c.id}-${adding}`} className="flex flex-wrap items-start gap-x-2 gap-y-1.5 py-2">
            <div className="min-w-0 flex-1 basis-60 space-y-1">
              <input
                value={c.name}
                onChange={(e) => set(i, { name: e.target.value })}
                aria-label={t("Name")}
                maxLength={60}
                className="w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-sm font-semibold text-[var(--text-strong)] hover:border-[var(--border)] focus:border-[var(--border-strong)] focus:outline-none"
              />
              <input
                value={c.description}
                onChange={(e) => set(i, { description: e.target.value })}
                aria-label={t("What it means")}
                maxLength={300}
                placeholder={t("What it means, in a line")}
                className="w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-xs text-[var(--text-muted)] hover:border-[var(--border)] focus:border-[var(--border-strong)] focus:outline-none"
              />
            </div>
            <div
              role="radiogroup"
              aria-label={`${t("Importance")}: ${c.name}`}
              className="mt-0.5 inline-flex overflow-hidden rounded-full border border-[var(--border-strong)] text-xs"
            >
              {IMPORTANCE.map((level, k) => {
                const on = c.weight === level.weight;
                return (
                  <button
                    key={level.weight}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => set(i, { weight: level.weight })}
                    className={`inline-flex items-center gap-1 whitespace-nowrap px-2.5 py-0.5 ${k > 0 ? "border-l border-[var(--border)]" : ""} ${
                      on ? level.on : "text-[var(--text-muted)] hover:bg-[var(--hover-surface)] hover:text-[var(--foreground)]"
                    }`}
                  >
                    {on ? <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${level.dot}`} /> : null}
                    {label[level.weight]}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => onChange(list.filter((_, j) => j !== i))}
              disabled={list.length <= 1}
              title={t("Remove")}
              aria-label={`${t("Remove")}: ${c.name}`}
              className="mt-1 inline-flex h-6 w-6 items-center justify-center rounded text-[var(--text-muted)] hover:bg-[var(--hover-surface)] hover:text-[var(--error)] disabled:opacity-40"
            >
              <CloseIcon className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
      </ul>
      <p className="text-xs text-[var(--text-muted)]">
        {t("Counts toward the score: Critical three times as much as Normal, Important twice.")}
      </p>
      <div className="flex flex-wrap items-center gap-3 pt-1">
        <button
          type="button"
          disabled={list.length >= MAX_CRITERIA}
          onClick={() => {
            setAdding((n) => n + 1);
            onChange([...list, { id: `c${Date.now().toString(36)}`, name: t("New criterion"), description: "", weight: 1 }]);
          }}
          className="btn-soft !px-3 !py-1 !text-xs"
        >
          + {t("Add a criterion")}
        </button>
        {own ? (
          <button type="button" onClick={() => onChange([])} className="text-xs text-[var(--text-muted)] hover:underline">
            {t("Back to the built-in criteria")}
          </button>
        ) : (
          <span className="text-xs text-[var(--text-muted)]">{t("The built-in criteria")}</span>
        )}
      </div>
    </div>
  );
}
