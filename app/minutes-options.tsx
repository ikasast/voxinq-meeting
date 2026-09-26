"use client";

import { useState } from "react";
import { useT } from "./locale-provider";

// The choices a set of minutes can be written with for one run: the format, how much detail,
// and which model. Never saved — the settings stay as they are.
//
// One component because two places ask: Regenerate on a meeting, and Write them all on the
// list. They used to be one copy, and the second place would have been a second copy that
// learns about a new option only when somebody remembers it exists.

// The labels are the keys, translated where they are rendered. A module-level constant has no
// hook to reach the language with, and the same spelling-out the meeting list's bands needed:
// a key that only exists at run time is one the table's test cannot see.
const DETAILS: { id: string; label: string }[] = [
  { id: "brief", label: "Brief (shorter)" },
  { id: "standard", label: "Standard" },
  { id: "detailed", label: "Detailed (fuller)" },
];

// Each provider uses the model configured for it in Settings — the fields just say which.
const PROVIDERS: { id: string; label: string }[] = [
  { id: "ollama", label: "Ollama (local)" },
  { id: "anthropic", label: "Anthropic" },
  { id: "openai", label: "OpenAI-compatible" },
];

/** The six option labels, spelled out so the table's test can find them. */
function optionLabel(t: (k: string) => string, label: string): string {
  const table: Record<string, string> = {
    "Brief (shorter)": t("Brief (shorter)"),
    Standard: t("Standard"),
    "Detailed (fuller)": t("Detailed (fuller)"),
    "Ollama (local)": t("Ollama (local)"),
    Anthropic: t("Anthropic"),
    "OpenAI-compatible": t("OpenAI-compatible"),
  };
  return table[label] ?? label;
}

/** What the run is asked for with. An empty `templateId` means "as the settings and series say". */
export type MinutesChoice = { detail: string; provider: string; templateId: string };

/**
 * The choice, prefilled from the saved settings the first time it is needed.
 *
 * Loaded on demand rather than on mount: both places that use it are closed until somebody
 * opens them, and a settings read per meeting card for a panel nobody opens is a request per
 * render for nothing.
 */
export function useMinutesChoice() {
  const [choice, setChoice] = useState<MinutesChoice>({
    detail: "standard",
    provider: "ollama",
    templateId: "",
  });
  const [templates, setTemplates] = useState<{ id: string; name: string }[]>([]);
  const [models, setModels] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);

  const load = async () => {
    if (loaded) return;
    try {
      const res = await fetch("/api/settings");
      if (!res.ok) return;
      const s = await res.json();
      setChoice({
        detail: s.summaryDetail ?? "standard",
        provider: s.llmProvider ?? "ollama",
        templateId: s.defaultMinutesTemplateId ?? "",
      });
      setTemplates(Array.isArray(s.minutesTemplates) ? s.minutesTemplates : []);
      setModels({
        ollama: s.ollamaModel ?? "",
        anthropic: s.anthropicModel ?? "",
        openai: s.openaiModel ?? "",
      });
      setLoaded(true);
    } catch {
      // Leave the defaults: the run can still be asked for, just not prefilled.
    }
  };

  return { choice, setChoice, templates, models, loaded, load };
}

/** The three fields. `idPrefix` keeps two of these on one page from sharing label targets. */
export function MinutesChoiceFields({
  idPrefix,
  choice,
  onChange,
  templates,
  models,
}: {
  idPrefix: string;
  choice: MinutesChoice;
  onChange: (next: MinutesChoice) => void;
  templates: { id: string; name: string }[];
  models: Record<string, string>;
}) {
  const t = useT();
  return (
    <>
      <div>
        <label htmlFor={`${idPrefix}-template`} className="label">
          {t("Format")}
        </label>
        <select
          id={`${idPrefix}-template`}
          value={choice.templateId}
          onChange={(e) => onChange({ ...choice, templateId: e.target.value })}
          className="input mt-1"
        >
          {/* Empty means "whatever the settings and the series say". "default" asks for the
              built-in explicitly, which is otherwise unreachable once a series has its own. */}
          <option value="">{t("Same as settings")}</option>
          <option value="default">{t("Built-in default")}</option>
          {templates.map((tpl) => (
            <option key={tpl.id} value={tpl.id}>
              {tpl.name}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`${idPrefix}-detail`} className="label">
            {t("Detail")}
          </label>
          <select
            id={`${idPrefix}-detail`}
            value={choice.detail}
            onChange={(e) => onChange({ ...choice, detail: e.target.value })}
            className="input mt-1"
          >
            {DETAILS.map((d) => (
              <option key={d.id} value={d.id}>
                {optionLabel(t, d.label)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`${idPrefix}-provider`} className="label">
            {t("Provider")}
          </label>
          <select
            id={`${idPrefix}-provider`}
            value={choice.provider}
            onChange={(e) => onChange({ ...choice, provider: e.target.value })}
            className="input mt-1"
          >
            {PROVIDERS.map((p) => (
              <option key={p.id} value={p.id}>
                {optionLabel(t, p.label)}
              </option>
            ))}
          </select>
          {models[choice.provider] ? (
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              {t("Model: {model} (from Settings)", { model: models[choice.provider] })}
            </p>
          ) : null}
        </div>
      </div>
    </>
  );
}
