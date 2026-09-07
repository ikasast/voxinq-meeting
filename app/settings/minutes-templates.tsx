"use client";

import { useState } from "react";
import { DEFAULT_SUMMARY_FORMAT } from "@/lib/minutes-prompt";
import { type MinutesTemplate, newTemplateId } from "@/lib/minutes-templates";
import { useT } from "@/app/locale-provider";

// Saved minutes formats.
//
// One row each with the fields behind a click, the same as the recognition endpoints -- a
// format is a long block of text, and three of them laid out at once is a page nobody reads.
//
// New templates start from the built-in format rather than from nothing. Writing a heading
// structure from a blank box means guessing what the prompt expects; starting from the one
// that works and changing the headings does not.

const inputClass = "input mt-1";
const labelClass = "label";

export function MinutesTemplates({
  templates,
  defaultId,
  disabled,
  onChange,
  onDefaultChange,
}: {
  templates: MinutesTemplate[];
  defaultId: string;
  disabled: boolean;
  onChange: (next: MinutesTemplate[]) => void;
  onDefaultChange: (id: string) => void;
}) {
  const t = useT();
  const [editing, setEditing] = useState<string | null>(null);
  const draft = templates.find((tpl) => tpl.id === editing) ?? null;

  const update = (id: string, patch: Partial<MinutesTemplate>) =>
    onChange(templates.map((tpl) => (tpl.id === id ? { ...tpl, ...patch } : tpl)));

  const add = () => {
    const created: MinutesTemplate = {
      id: newTemplateId(),
      name: "New format",
      body: DEFAULT_SUMMARY_FORMAT,
    };
    onChange([...templates, created]);
    setEditing(created.id);
  };

  const remove = (id: string) => {
    onChange(templates.filter((tpl) => tpl.id !== id));
    if (defaultId === id) onDefaultChange("");
    if (editing === id) setEditing(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0 flex-1">
          <label htmlFor="defaultMinutesTemplateId" className={labelClass}>
            {t("Minutes format")}
          </label>
          <select
            id="defaultMinutesTemplateId"
            value={defaultId}
            onChange={(e) => onDefaultChange(e.target.value)}
            disabled={disabled}
            className={inputClass}
          >
            <option value="">{t("Built-in default")}</option>
            {templates.map((tpl) => (
              <option key={tpl.id} value={tpl.id}>
                {tpl.name || t("Unnamed")}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            {t(
              "What new minutes use. Any of these can still be picked for a single run from {action}. A series with its own format keeps using that.",
              { action: t("Regenerate") },
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={add}
          disabled={disabled}
          className="btn-ink px-3 py-2 text-sm"
        >
          {t("+ Add format")}
        </button>
      </div>

      {templates.length === 0 ? (
        <p className="rounded-md border border-dashed border-[var(--border)] p-4 text-xs text-[var(--text-muted)]">
          {t("No saved formats. Minutes use the built-in one: an overview, then the discussion by topic, then decisions and action items.")}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-[var(--border)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-[11px] uppercase tracking-wide text-[var(--text-muted)]">
                <th className="px-3 py-2 font-medium">{t("Name")}</th>
                <th className="px-3 py-2 font-medium">{t("Starts with")}</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {templates.map((tpl) => (
                <tr key={tpl.id} className="border-b border-[var(--border)] last:border-b-0">
                  <td className="px-3 py-2">
                    <span className="font-medium text-[var(--text-strong)]">
                      {tpl.name || "Unnamed"}
                    </span>
                    {tpl.id === defaultId ? (
                      <span className="ml-2 rounded-full bg-[color-mix(in_srgb,var(--accent)_18%,transparent)] px-2 py-0.5 text-[10px] font-medium text-[var(--accent-sub)]">
                        {t("default")}
                      </span>
                    ) : null}
                  </td>
                  <td className="max-w-0 truncate px-3 py-2 text-xs text-[var(--text-secondary)]">
                    {tpl.body.split("\n").find((l) => l.trim()) ?? ""}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => setEditing(tpl.id)}
                        disabled={disabled}
                        className="btn-outline px-2 py-1 text-xs"
                      >
                        {t("Edit")}
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(tpl.id)}
                        disabled={disabled}
                        className="btn-outline px-2 py-1 text-xs text-[var(--error)]"
                        aria-label={`Remove ${tpl.name || "format"}`}
                      >
                        {t("Remove")}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {draft ? (
        <div className="rounded-md border border-[var(--accent)] bg-[var(--elevated)] p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-[var(--text-strong)]">
              {draft.name || "Format"}
            </h3>
            <button
              type="button"
              onClick={() => setEditing(null)}
              className="btn-outline px-2 py-1 text-xs"
            >
              {t("Close")}
            </button>
          </div>
          <div>
            <label className={labelClass} htmlFor={`tname-${draft.id}`}>
              {t("Name")}
            </label>
            <input
              id={`tname-${draft.id}`}
              type="text"
              value={draft.name}
              onChange={(e) => update(draft.id, { name: e.target.value })}
              className={inputClass}
            />
          </div>
          <div className="mt-3">
            <label className={labelClass} htmlFor={`tbody-${draft.id}`}>
              {t("Format")}
            </label>
            <textarea
              id={`tbody-${draft.id}`}
              value={draft.body}
              onChange={(e) => update(draft.id, { body: e.target.value })}
              rows={16}
              className={`${inputClass} font-mono text-xs`}
            />
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              {t("The heading structure the model is asked to follow. Its first heading is also used to start the model off, so keep one at the top.")}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
