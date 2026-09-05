"use client";

import { useEffect, useState } from "react";

// What everybody starts from.
//
// Every other tab on this screen is *yours*: an administrator changing their minutes language
// changes their own minutes. This one is the house standard — it reaches everybody who has not
// chosen for themselves, and stops reaching each of them the moment they do.
//
// It is a separate tab rather than a mode on the others because the difference matters and a
// toggle is easy to miss. Somebody setting Japanese for themselves and somebody setting it for
// the household are doing different things, and doing the second by accident is the sort of
// mistake nobody notices until other people ask why their minutes changed language.
//
// Hardware is not here. There is one card and one transcription service, so those are not
// defaults anybody falls back to — they are on the ordinary screen, where an administrator is
// already the only one who can move them.

type Defaults = {
  summaryLanguage: string;
  summaryDetail: string;
  sttLanguage: string;
  micMode: string;
  sttTranslate: boolean;
  sttGlossary: string;
  llmProvider: string;
  ollamaBaseUrl: string;
  ollamaModel: string;
};

const FIELDS: {
  key: keyof Defaults;
  label: string;
  hint?: string;
  options?: { value: string; label: string }[];
  kind?: "text" | "textarea" | "boolean";
}[] = [
  {
    key: "summaryLanguage",
    label: "Minutes language",
    options: [
      { value: "ja", label: "Japanese (日本語)" },
      { value: "en", label: "English" },
      { value: "zh", label: "Chinese (中文)" },
    ],
  },
  {
    key: "summaryDetail",
    label: "Minutes detail",
    options: [
      { value: "brief", label: "Brief" },
      { value: "standard", label: "Standard" },
      { value: "detailed", label: "Detailed" },
    ],
  },
  {
    key: "sttLanguage",
    label: "Transcription language",
    options: [
      { value: "auto", label: "Auto-detect" },
      { value: "ja", label: "Japanese (fixed)" },
      { value: "en", label: "English (fixed)" },
    ],
  },
  {
    key: "micMode",
    label: "Microphone mode",
    options: [
      { value: "standard", label: "Standard" },
      { value: "room", label: "Room (distant voices)" },
    ],
  },
  { key: "sttTranslate", label: "Japanese translation under each line", kind: "boolean" },
  {
    key: "sttGlossary",
    label: "Glossary",
    kind: "textarea",
    hint: "Terms and names the recogniser should expect. People can add their own on top.",
  },
  {
    key: "llmProvider",
    label: "Minutes are written by",
    options: [
      { value: "ollama", label: "Ollama" },
      { value: "anthropic", label: "Anthropic" },
      { value: "openai", label: "OpenAI-compatible" },
    ],
  },
  { key: "ollamaBaseUrl", label: "Ollama address", kind: "text" },
  { key: "ollamaModel", label: "Ollama model", kind: "text" },
];

export function HouseDefaults() {
  const [values, setValues] = useState<Defaults | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/settings/defaults", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setValues((await res.json()) as Defaults);
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, []);

  const update = <K extends keyof Defaults>(key: K, v: Defaults[K]) =>
    setValues((s) => (s ? { ...s, [key]: v } : s));

  const save = async () => {
    if (!values) return;
    setSaving(true);
    setError(null);
    setMsg(null);
    try {
      const body: Record<string, unknown> = {};
      for (const f of FIELDS) body[f.key] = values[f.key];
      const res = await fetch("/api/settings/defaults", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(d?.error ?? `HTTP ${res.status}`);
      setMsg("Saved. Anybody who has not chosen for themselves uses these now.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (error && !values) return <p className="text-sm text-[var(--error)]">{error}</p>;
  if (!values) return <p className="text-sm text-[var(--text-muted)]">Loading…</p>;

  const label = "block text-xs font-medium text-[var(--text-secondary)]";
  const input =
    "mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm";

  return (
    <div className="space-y-4">
      <p className="rounded-md border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] px-3 py-2 text-xs text-[var(--accent-sub)]">
        These are what a new account starts with, and what anybody who has never changed a
        setting is using right now. Changing one here reaches all of them at once — and leaves
        alone anybody who has made their own choice.
      </p>

      {FIELDS.map((f) => (
        <div key={f.key}>
          {f.kind === "boolean" ? (
            <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
              <input
                type="checkbox"
                checked={values[f.key] as boolean}
                onChange={(e) => update(f.key, e.target.checked as never)}
                disabled={saving}
              />
              {f.label}
            </label>
          ) : (
            <>
              <label htmlFor={`d-${f.key}`} className={label}>
                {f.label}
              </label>
              {f.options ? (
                <select
                  id={`d-${f.key}`}
                  value={values[f.key] as string}
                  onChange={(e) => update(f.key, e.target.value as never)}
                  disabled={saving}
                  className={input}
                >
                  {f.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : f.kind === "textarea" ? (
                <textarea
                  id={`d-${f.key}`}
                  value={values[f.key] as string}
                  onChange={(e) => update(f.key, e.target.value as never)}
                  disabled={saving}
                  rows={3}
                  className={input}
                />
              ) : (
                <input
                  id={`d-${f.key}`}
                  value={values[f.key] as string}
                  onChange={(e) => update(f.key, e.target.value as never)}
                  disabled={saving}
                  className={input}
                />
              )}
            </>
          )}
          {f.hint ? <p className="mt-1 text-xs text-[var(--text-muted)]">{f.hint}</p> : null}
        </div>
      ))}

      {error ? <p className="text-sm text-[var(--error)]">{error}</p> : null}
      {msg ? <p className="text-sm text-[var(--accent-sub)]">{msg}</p> : null}
      <button type="button" onClick={() => void save()} disabled={saving} className="btn-ink">
        {saving ? "Saving…" : "Save the defaults"}
      </button>
    </div>
  );
}
