"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DEFAULT_SUMMARY_FORMAT } from "@/lib/minutes-prompt";
import { WHISPER_MODELS, isJapaneseOnlyModel, isKnownWhisperModel } from "@/lib/stt/models";
import { THEMES, readTheme, setTheme, watchSystemTheme, type Theme } from "@/lib/theme";
import { DataBackup } from "./data-backup";
import { RemoteAccess } from "./remote-access";
import { VoiceProfiles } from "./voice-profiles";

type PublicSettings = {
  whisperModel: string;
  sttLanguage: string;
  sttGlossary: string;
  micMode: string;
  sttTranslate: boolean;
  llmProvider: "ollama" | "anthropic" | "openai";
  ollamaBaseUrl: string;
  ollamaModel: string;
  anthropicModel: string;
  openaiBaseUrl: string;
  openaiModel: string;
  llmBackground: string;
  summaryFormat: string;
  hasAnthropicApiKey: boolean;
  hasOpenaiApiKey: boolean;
  summaryLanguage: string;
  summaryDetail: string;
};

const SUMMARY_DETAILS: { id: string; label: string }[] = [
  { id: "brief", label: "Brief (key points, shorter)" },
  { id: "standard", label: "Standard" },
  { id: "detailed", label: "Detailed (fuller for longer meetings)" },
];

const SUMMARY_LANGUAGES: { id: string; label: string }[] = [
  { id: "ja", label: "Japanese (日本語)" },
  { id: "en", label: "English" },
  { id: "zh", label: "Chinese (中文)" },
];

const STT_LANGUAGES: { id: string; label: string }[] = [
  { id: "auto", label: "Auto-detect (keep the spoken language)" },
  { id: "ja", label: "Japanese (fixed)" },
  { id: "en", label: "English (fixed)" },
];
const MIC_MODES: { id: string; label: string }[] = [
  { id: "standard", label: "Standard (close talk / calls)" },
  { id: "room", label: "Room (pick up distant voices)" },
];
const LLM_PROVIDERS: { id: PublicSettings["llmProvider"]; label: string }[] = [
  { id: "ollama", label: "Ollama (local, default)" },
  { id: "anthropic", label: "Anthropic (Claude API)" },
  { id: "openai", label: "OpenAI-compatible API" },
];

// Settings tabs. Grouped by category as the number of items has grown.
const TABS = [
  { id: "stt", label: "Transcription" },
  { id: "speakers", label: "Speakers" },
  { id: "minutes", label: "Minutes" },
  { id: "llm", label: "LLM" },
  { id: "remote", label: "Remote access" },
  { id: "data", label: "Data" },
  { id: "appearance", label: "Appearance" },
] as const;
type TabId = (typeof TABS)[number]["id"];


const inputClass = "input mt-1";
const labelClass = "label";

function fieldsetClass(active: boolean) {
  return `space-y-3 rounded-md border p-4 ${
    active
      ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_12%,transparent)]"
      : "border-[var(--border)]"
  }`;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [anthropicApiKey, setAnthropicApiKey] = useState("");
  const [openaiApiKey, setOpenaiApiKey] = useState("");
  const [clearAnthropicApiKey, setClearAnthropicApiKey] = useState(false);
  const [clearOpenaiApiKey, setClearOpenaiApiKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [tab, setTab] = useState<TabId>("stt");

  // Theme is per device (localStorage). Applied the instant it is chosen, independent of
  // server settings — see lib/theme.ts, which the header toggle shares.
  const [theme, setThemeState] = useState<Theme>("system");
  useEffect(() => setThemeState(readTheme()), []);
  // Keep following the OS while "system" is selected.
  useEffect(() => watchSystemTheme(() => theme), [theme]);
  const applyTheme = (t: Theme) => {
    setThemeState(t);
    setTheme(t);
  };

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data: PublicSettings) => setSettings(data))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"));
  }, []);

  const update = <K extends keyof PublicSettings>(key: K, value: PublicSettings[K]) => {
    setSettings((prev) => (prev ? { ...prev, [key]: value } : prev));
    setSaved(false);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    setError(null);
    setSaved(false);
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        whisperModel: settings.whisperModel,
        sttLanguage: settings.sttLanguage,
        sttGlossary: settings.sttGlossary,
        micMode: settings.micMode,
        sttTranslate: settings.sttTranslate,
        llmProvider: settings.llmProvider,
        ollamaBaseUrl: settings.ollamaBaseUrl,
        ollamaModel: settings.ollamaModel,
        anthropicModel: settings.anthropicModel,
        openaiBaseUrl: settings.openaiBaseUrl,
        openaiModel: settings.openaiModel,
        llmBackground: settings.llmBackground,
        summaryFormat: settings.summaryFormat,
        summaryLanguage: settings.summaryLanguage,
        summaryDetail: settings.summaryDetail,
      };
      if (anthropicApiKey.trim()) body.anthropicApiKey = anthropicApiKey.trim();
      if (openaiApiKey.trim()) body.openaiApiKey = openaiApiKey.trim();
      if (clearAnthropicApiKey) body.clearAnthropicApiKey = true;
      if (clearOpenaiApiKey) body.clearOpenaiApiKey = true;

      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? `HTTP ${res.status}`);
      }
      const next = (await res.json()) as PublicSettings;
      setSettings(next);
      setAnthropicApiKey("");
      setOpenaiApiKey("");
      setClearAnthropicApiKey(false);
      setClearOpenaiApiKey(false);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (!settings) {
    return (
      <div className="mx-auto max-w-xl space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-strong)]">Settings</h1>
        {error ? (
          <p className="text-sm text-[var(--error)]">{error}</p>
        ) : (
          <p className="text-sm text-[var(--text-muted)]">Loading…</p>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-strong)]">Settings</h1>

      <form onSubmit={onSubmit} className="space-y-6">
        {/* Category tabs */}
        <div className="flex flex-wrap gap-1 border-b border-[var(--border)]">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`-mb-px rounded-t-md px-4 py-2 text-sm font-medium ${
                tab === t.id
                  ? "border-b-2 border-[var(--accent)] text-[var(--text-strong)]"
                  : "text-[var(--text-muted)] hover:text-[var(--foreground)]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Transcription */}
        {tab === "stt" ? (
        <section className="card space-y-4 p-6">
          <h2 className="section-title text-sm font-semibold text-[var(--text-strong)]">Transcription (Whisper)</h2>
          <div>
            <label htmlFor="whisperModel" className={labelClass}>
              Model
            </label>
            <select
              id="whisperModel"
              value={settings.whisperModel}
              onChange={(e) => update("whisperModel", e.target.value)}
              disabled={saving}
              className={inputClass}
            >
              {WHISPER_MODELS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
              {isKnownWhisperModel(settings.whisperModel) ? null : (
                <option value={settings.whisperModel}>{settings.whisperModel} (custom)</option>
              )}
            </select>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              8GB VRAM guide: large-v3 ≈3GB / large-v3-turbo (default; fast and accurate) ≈1.7GB / medium · distil-large-v3 ≈1.5GB / small ≈0.5GB.
              kotoba-whisper ≈1.5GB — distilled on Japanese speech, so it is faster and more accurate for Japanese, but Japanese-only (transcription language is forced to Japanese), it adds little punctuation, and it cannot take a glossary (the terms below are skipped for it). Downloaded from Hugging Face on first use.
            </p>
            {/* Set as the default it applies to every meeting, so make the trade-off loud here. */}
            {isJapaneseOnlyModel(settings.whisperModel) ? (
              <p className="mt-1 text-xs text-[var(--warning)]">
                This is a Japanese-only model — meetings in other languages will not transcribe.
                It becomes the default for every new meeting; you can still pick another model
                per meeting on the New meeting screen.
              </p>
            ) : null}
          </div>

          <div>
            <label htmlFor="sttLanguage" className={labelClass}>
              Transcription language
            </label>
            <select
              id="sttLanguage"
              value={settings.sttLanguage}
              onChange={(e) => update("sttLanguage", e.target.value)}
              disabled={saving}
              className={inputClass}
            >
              {STT_LANGUAGES.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              “Auto-detect” transcribes in the spoken language (minutes language is set separately below).
            </p>
          </div>

          <div>
            <label htmlFor="sttGlossary" className={labelClass}>
              Terms / proper nouns (recognition bias)
            </label>
            <textarea
              id="sttGlossary"
              value={settings.sttGlossary}
              onChange={(e) => update("sttGlossary", e.target.value)}
              disabled={saving}
              rows={2}
              placeholder="e.g. Acme Corp, Project Aurora, Jane Doe, Voxinq Meeting"
              className="input mt-1 resize-y"
            />
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Adding jargon, names, and product names improves accuracy. Keep it short (~150 chars).
            </p>
          </div>

          <div>
            <label htmlFor="micMode" className={labelClass}>
              Microphone mode
            </label>
            <select
              id="micMode"
              value={settings.micMode}
              onChange={(e) => update("micMode", e.target.value)}
              disabled={saving}
              className={inputClass}
            >
              {MIC_MODES.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              “Room” turns off echo/noise suppression and raises auto-gain to pick up distant speech.
              Placing the device in the center of the table helps.
            </p>
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
              <input
                type="checkbox"
                checked={settings.sttTranslate}
                onChange={(e) => update("sttTranslate", e.target.checked)}
                disabled={saving}
                className="h-4 w-4 accent-[var(--accent)]"
              />
              Translate non-Japanese speech into Japanese
            </label>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Shows a Japanese translation under each non-Japanese utterance, during the meeting and
              on the transcript. Japanese speech is left alone, and minutes are still generated from
              the original words. Translation runs on the CPU, so it does not compete with
              transcription for the GPU. Turning this on downloads a ~600MB translation model
              (NLLB-200 distilled, <strong>CC-BY-NC — non-commercial use only</strong>) to the STT
              host on first use.
            </p>
          </div>
        </section>
        ) : null}

        {/* Voice profiles (speaker auto-naming) */}
        {tab === "speakers" ? <VoiceProfiles /> : null}

        {/* Minutes (business background / format) */}
        {tab === "minutes" ? (
        <section className="card space-y-4 p-6">
          <h2 className="section-title text-sm font-semibold text-[var(--text-strong)]">Minutes (language, background, format)</h2>
          <div>
            <label htmlFor="summaryLanguage" className={labelClass}>
              Minutes language
            </label>
            <select
              id="summaryLanguage"
              value={settings.summaryLanguage}
              onChange={(e) => update("summaryLanguage", e.target.value)}
              disabled={saving}
              className={inputClass}
            >
              {SUMMARY_LANGUAGES.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Minutes are generated in this language regardless of the spoken language.
            </p>
          </div>
          <div>
            <label htmlFor="summaryDetail" className={labelClass}>
              Minutes detail
            </label>
            <select
              id="summaryDetail"
              value={settings.summaryDetail}
              onChange={(e) => update("summaryDetail", e.target.value)}
              disabled={saving}
              className={inputClass}
            >
              {SUMMARY_DETAILS.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              How much detail. “Detailed” grows with longer meetings (takes a bit longer). Long meetings are auto-summarized in chunks, so the latter half is never dropped.
            </p>
          </div>
          <div>
            <label htmlFor="llmBackground" className={labelClass}>
              Business / research background
            </label>
            <textarea
              id="llmBackground"
              value={settings.llmBackground}
              onChange={(e) => update("llmBackground", e.target.value)}
              disabled={saving}
              rows={6}
              placeholder="Org, research topics, ongoing projects, people, and background knowledge. Referenced every time as context for all minutes."
              className="input mt-1 resize-y"
            />
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Always-on context, separate from each meeting’s purpose. Aim for ~half to one page (too long hurts accuracy). Used only to interpret terms — not copied into minutes.
            </p>
          </div>

          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label htmlFor="summaryFormat" className="label">
                Minutes format (optional)
              </label>
              <button
                type="button"
                onClick={() => update("summaryFormat", DEFAULT_SUMMARY_FORMAT)}
                disabled={saving}
                className="rounded-md border border-[var(--border-strong)] px-2 py-1 text-xs text-[var(--text-secondary)] hover:bg-[var(--hover-surface)] disabled:opacity-50"
              >
                Load default format
              </button>
            </div>
            <textarea
              id="summaryFormat"
              value={settings.summaryFormat}
              onChange={(e) => update("summaryFormat", e.target.value)}
              disabled={saving}
              rows={10}
              placeholder={DEFAULT_SUMMARY_FORMAT}
              className="input mt-1 resize-y font-mono text-xs leading-relaxed"
            />
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Specify the heading structure and granularity. If empty, the default format (shown as the placeholder) is used.
              Click “Load default format” to import it, then edit to make it your own.
            </p>
          </div>
        </section>
        ) : null}

        {/* LLM */}
        {tab === "llm" ? (
        <section className="card space-y-4 p-6">
          <h2 className="section-title text-sm font-semibold text-[var(--text-strong)]">Minutes generation (LLM)</h2>
          <div>
            <label htmlFor="llmProvider" className={labelClass}>
              Provider
            </label>
            <select
              id="llmProvider"
              value={settings.llmProvider}
              onChange={(e) => update("llmProvider", e.target.value as PublicSettings["llmProvider"])}
              disabled={saving}
              className={inputClass}
            >
              {LLM_PROVIDERS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          {/* Ollama fieldset */}
          <fieldset disabled={saving} className={fieldsetClass(settings.llmProvider === "ollama")}>
            <legend className="px-1 text-xs font-medium text-[var(--text-secondary)]">Ollama</legend>
            <div>
              <label htmlFor="ollamaBaseUrl" className={labelClass}>
                Base URL
              </label>
              <input
                id="ollamaBaseUrl"
                type="text"
                value={settings.ollamaBaseUrl}
                onChange={(e) => update("ollamaBaseUrl", e.target.value)}
                placeholder="http://127.0.0.1:11434"
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="ollamaModel" className={labelClass}>
                Model
              </label>
              <input
                id="ollamaModel"
                type="text"
                value={settings.ollamaModel}
                onChange={(e) => update("ollamaModel", e.target.value)}
                placeholder="qwen2.5:7b-instruct"
                className={inputClass}
              />
            </div>
          </fieldset>

          {/* Anthropic */}
          <fieldset disabled={saving} className={fieldsetClass(settings.llmProvider === "anthropic")}>
            <legend className="px-1 text-xs font-medium text-[var(--text-secondary)]">Anthropic</legend>
            <div>
              <label htmlFor="anthropicModel" className={labelClass}>
                Model
              </label>
              <input
                id="anthropicModel"
                type="text"
                value={settings.anthropicModel}
                onChange={(e) => update("anthropicModel", e.target.value)}
                placeholder="claude-sonnet-4-6"
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="anthropicApiKey" className={labelClass}>
                API key
              </label>
              <input
                id="anthropicApiKey"
                type="password"
                value={anthropicApiKey}
                onChange={(e) => {
                  setAnthropicApiKey(e.target.value);
                  setSaved(false);
                }}
                placeholder={settings.hasAnthropicApiKey ? "Set (enter only to change)" : "Not set"}
                autoComplete="off"
                className={inputClass}
              />
              {settings.hasAnthropicApiKey ? (
                <label className="mt-2 flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                  <input
                    type="checkbox"
                    checked={clearAnthropicApiKey}
                    onChange={(e) => setClearAnthropicApiKey(e.target.checked)}
                    className="accent-[var(--error)]"
                  />
                  Delete the saved key
                </label>
              ) : null}
            </div>
          </fieldset>

          {/* OpenAI */}
          <fieldset disabled={saving} className={fieldsetClass(settings.llmProvider === "openai")}>
            <legend className="px-1 text-xs font-medium text-[var(--text-secondary)]">OpenAI-compatible (vLLM / LM Studio / OpenAI)</legend>
            <div>
              <label htmlFor="openaiBaseUrl" className={labelClass}>
                Base URL
              </label>
              <input
                id="openaiBaseUrl"
                type="text"
                value={settings.openaiBaseUrl}
                onChange={(e) => update("openaiBaseUrl", e.target.value)}
                placeholder="https://api.openai.com/v1"
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="openaiModel" className={labelClass}>
                Model
              </label>
              <input
                id="openaiModel"
                type="text"
                value={settings.openaiModel}
                onChange={(e) => update("openaiModel", e.target.value)}
                placeholder="gpt-4o-mini"
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="openaiApiKey" className={labelClass}>
                API key (leave empty for local servers)
              </label>
              <input
                id="openaiApiKey"
                type="password"
                value={openaiApiKey}
                onChange={(e) => {
                  setOpenaiApiKey(e.target.value);
                  setSaved(false);
                }}
                placeholder={settings.hasOpenaiApiKey ? "Set (enter only to change)" : "Not set (OK for LM Studio / vLLM)"}
                autoComplete="off"
                className={inputClass}
              />
              {settings.hasOpenaiApiKey ? (
                <label className="mt-2 flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                  <input
                    type="checkbox"
                    checked={clearOpenaiApiKey}
                    onChange={(e) => setClearOpenaiApiKey(e.target.checked)}
                    className="accent-[var(--error)]"
                  />
                  Delete the saved key
                </label>
              ) : null}
            </div>
          </fieldset>
        </section>
        ) : null}

        {/* Remote access (Tailscale Funnel publish toggle) */}
        {tab === "remote" ? <RemoteAccess /> : null}

        {tab === "data" ? <DataBackup /> : null}

        {/* Appearance */}
        {tab === "appearance" ? (
        <section className="card space-y-4 p-6">
          <h2 className="section-title text-sm font-semibold text-[var(--text-strong)]">Appearance</h2>
          <div>
            <p className="label">Theme</p>
            <div className="mt-2 grid max-w-sm grid-cols-3 gap-2">
              {THEMES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => applyTheme(t.id)}
                  className={`rounded-md border px-3 py-2 text-sm ${
                    theme === t.id
                      ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] text-[var(--accent-sub)]"
                      : "border-[var(--border-strong)] text-[var(--text-secondary)] hover:border-[var(--accent)]"
                  }`}
                >
                  {t.label}
                  {t.id === "system" ? (
                    <span className="block text-[11px] opacity-70">default</span>
                  ) : null}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-[var(--text-muted)]">
              Applied instantly and saved per device (browser). No need to press “Save”.
              “System” follows your OS and changes with it. Read-only visitors get the same
              choice from the icon in the header.
            </p>
          </div>
        </section>
        ) : null}

        {error ? <p className="text-sm text-[var(--error)]">{error}</p> : null}
        {saved ? <p className="text-sm text-[var(--success)]">Saved.</p> : null}

        <div className="flex items-center justify-end gap-2">
          <Link href="/" className="btn-outline">
            Back
          </Link>
          <button type="submit" disabled={saving} className="btn-ink">
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}
