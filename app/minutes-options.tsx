"use client";

import { useCallback, useState } from "react";
import { CONTEXT_KEYS, type ContextKey, includeForFormat, resolveInclude } from "@/lib/minutes-context";
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

/** The seven pieces of context, spelled out so the table's test can find them. */
function contextLabel(t: (k: string) => string, key: ContextKey): string {
  const table: Record<ContextKey, string> = {
    meeting: t("Meeting name and time"),
    participants: t("Participants"),
    purpose: t("Purpose and agenda"),
    glossary: t("Glossary"),
    series: t("Series background"),
    previous: t("Previous minutes in the series"),
    background: t("Business background (Settings)"),
  };
  return table[key];
}

/**
 * What the run is asked for with. An empty `templateId` means "as the settings and series say";
 * an absent `include` means "what the template has on".
 */
export type MinutesChoice = { detail: string; provider: string; templateId: string; include?: ContextKey[] };

type TemplateSummary = { id: string; name: string; include?: ContextKey[] };

/**
 * The choice, prefilled from the saved settings the first time it is needed.
 *
 * Loaded on demand rather than on mount: both places that use it are closed until somebody
 * opens them, and a settings read per meeting card for a panel nobody opens is a request per
 * render for nothing.
 */
export function useMinutesChoice(meetingId?: string) {
  const [choice, setChoice] = useState<MinutesChoice>({
    detail: "standard",
    provider: "ollama",
    templateId: "",
  });
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [defaultTemplateId, setDefaultTemplateId] = useState("");
  const [models, setModels] = useState<Record<string, string>>({});
  // What each piece holds for this meeting; absent when the choice is for many meetings.
  const [previews, setPreviews] = useState<Record<ContextKey, string | null> | undefined>();
  const [loaded, setLoaded] = useState(false);

  // Stable, so a dialog can ask for it from an effect without asking on every render.
  const load = useCallback(async () => {
    if (loaded) return;
    try {
      const res = await fetch("/api/settings");
      if (!res.ok) return;
      const s = await res.json();
      const saved: TemplateSummary[] = Array.isArray(s.minutesTemplates) ? s.minutesTemplates : [];
      const defaultId: string = s.defaultMinutesTemplateId ?? "";
      setChoice({
        detail: s.summaryDetail ?? "standard",
        provider: s.llmProvider ?? "ollama",
        templateId: defaultId,
        include: resolveInclude(saved, { defaultId }),
      });
      setTemplates(saved);
      setDefaultTemplateId(defaultId);
      if (meetingId) {
        const ctx = await fetch(`/api/meetings/${meetingId}/minutes/context`).catch(() => null);
        if (ctx?.ok) setPreviews((await ctx.json()).previews);
      }
      setModels({
        ollama: s.ollamaModel ?? "",
        anthropic: s.anthropicModel ?? "",
        openai: s.openaiModel ?? "",
      });
      setLoaded(true);
    } catch {
      // Leave the defaults: the run can still be asked for, just not prefilled.
    }
  }, [loaded, meetingId]);

  return { choice, setChoice, templates, defaultTemplateId, models, previews, loaded, load };
}

/** The three fields. `idPrefix` keeps two of these on one page from sharing label targets. */
export function MinutesChoiceFields({
  idPrefix,
  choice,
  onChange,
  templates,
  defaultTemplateId = "",
  models,
  previews,
}: {
  idPrefix: string;
  choice: MinutesChoice;
  onChange: (next: MinutesChoice) => void;
  templates: TemplateSummary[];
  defaultTemplateId?: string;
  models: Record<string, string>;
  previews?: Record<ContextKey, string | null>;
}) {
  const t = useT();
  const included = new Set(choice.include ?? CONTEXT_KEYS);
  // What was ticked or unticked here by hand. A template sets the defaults, not the answer:
  // choosing another format used to put every box back to that template's, and quietly undid
  // what had just been decided about the agenda or the glossary.
  const [byHand, setByHand] = useState<Partial<Record<ContextKey, boolean>>>({});
  const toggle = (key: ContextKey, on: boolean) => {
    setByHand((h) => ({ ...h, [key]: on }));
    const next = new Set(included);
    if (on) next.add(key);
    else next.delete(key);
    onChange({ ...choice, include: CONTEXT_KEYS.filter((k) => next.has(k)) });
  };
  return (
    <>
      <div>
        <label htmlFor={`${idPrefix}-template`} className="label">
          {t("Format")}
        </label>
        <select
          id={`${idPrefix}-template`}
          value={choice.templateId}
          // A template carries its own defaults for what goes in with the transcript.
          onChange={(e) =>
            onChange({
              ...choice,
              templateId: e.target.value,
              include: includeForFormat(
                resolveInclude(templates, { chosenId: e.target.value, defaultId: defaultTemplateId }),
                byHand,
              ),
            })
          }
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

      <ContextChecklist
        idPrefix={idPrefix}
        included={included}
        onToggle={toggle}
        previews={previews}
        sentAway={choice.provider !== "ollama"}
      />
    </>
  );
}

/**
 * The pieces of context, each with what it holds for this meeting, so what the model is given
 * is decided looking at it. Shared with the template editor, where it sets the defaults.
 */
export function ContextChecklist({
  idPrefix,
  included,
  onToggle,
  previews,
  sentAway = false,
  disabled = false,
}: {
  idPrefix: string;
  included: Set<ContextKey>;
  onToggle: (key: ContextKey, on: boolean) => void;
  previews?: Record<ContextKey, string | null>;
  sentAway?: boolean;
  disabled?: boolean;
}) {
  const t = useT();
  return (
    // min-w-0: a fieldset is never narrower than its content's unbroken width, so the previews'
    // `truncate` had nothing to cut against and a long agenda ran out of the panel.
    <fieldset className="min-w-0">
      <legend className="label">{t("Given to the model with the transcript")}</legend>
      <div className="mt-1 space-y-1.5">
        {CONTEXT_KEYS.map((key) => {
          const preview = previews?.[key];
          return (
            <label key={key} htmlFor={`${idPrefix}-ctx-${key}`} className="flex items-start gap-2 text-sm">
              <input
                id={`${idPrefix}-ctx-${key}`}
                type="checkbox"
                checked={included.has(key)}
                onChange={(e) => onToggle(key, e.target.checked)}
                disabled={disabled}
                className="mt-1 accent-[var(--accent)]"
              />
              <span className="min-w-0 flex-1">
                <span className="text-[var(--text-strong)]">{contextLabel(t, key)}</span>
                {previews ? (
                  <span className="block truncate text-xs text-[var(--text-muted)]">
                    {preview ?? t("(nothing for this meeting)")}
                  </span>
                ) : null}
              </span>
            </label>
          );
        })}
      </div>
      {sentAway ? (
        <p className="mt-2 text-xs text-[var(--warning)]">
          {t("With this provider, the checked items and the transcript are sent outside this machine.")}
        </p>
      ) : null}
    </fieldset>
  );
}
