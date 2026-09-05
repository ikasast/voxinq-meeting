"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { HouseDefaults } from "./house-defaults";
import { MachineNote } from "./machine-note";
import { DEFAULT_SUMMARY_FORMAT } from "@/lib/minutes-prompt";
import {
  WHISPER_MODELS,
  isJapaneseOnlyModel,
  isKnownWhisperModel,
  modelSizeGuide,
  whisperModel,
} from "@/lib/stt/models";
import { THEMES, readTheme, setTheme, watchSystemTheme, type Theme } from "@/lib/theme";
import { DataBackup } from "./data-backup";
import { RemoteAccess } from "./remote-access";
import { VoiceProfiles } from "./voice-profiles";
import { ExternalProviderNotice } from "./external-provider-notice";
import { RemoteSttNotice } from "./remote-stt-notice";
import { sttDestination } from "@/lib/stt/destination";
import { SttProfiles, type DraftProfile } from "./stt-profiles";
import { MinutesTemplates } from "./minutes-templates";
import type { MinutesTemplate } from "@/lib/minutes-templates";
import type { PublicSttProfile } from "@/lib/stt/profiles";

type PublicSettings = {
  /** Whether the reader may change the settings that describe the machine. */
  isAdmin: boolean;
  whisperModel: string;
  sttLanguage: string;
  sttGlossary: string;
  micMode: string;
  sttTranslate: boolean;
  sttProfiles: PublicSttProfile[];
  sttDefaultProfileId: string;
  llmProvider: "ollama" | "anthropic" | "openai";
  ollamaBaseUrl: string;
  ollamaModel: string;
  anthropicModel: string;
  openaiBaseUrl: string;
  openaiModel: string;
  llmBackground: string;
  minutesTemplates: MinutesTemplate[];
  defaultMinutesTemplateId: string;
  hasAnthropicApiKey: boolean;
  hasOpenaiApiKey: boolean;
  summaryLanguage: string;
  summaryDetail: string;
  restScreenSeconds: number;
  vramBudgetMb: number;
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
  { id: "ollama", label: "Ollama (default)" },
  { id: "anthropic", label: "Anthropic (Claude API — sends your transcripts off this machine)" },
  { id: "openai", label: "OpenAI-compatible API (OpenAI, or a local server like LM Studio)" },
];

// Settings tabs. Grouped by category as the number of items has grown.
// Minutes, in the words a phone user would use. The values are the ones lib/settings.ts
// accepts; anything else is refused there and by the API.
const REST_SCREEN_CHOICES = [
  { value: 0, label: "Never — keep the screen on" },
  { value: 30, label: "After 30 seconds" },
  { value: 60, label: "After 1 minute" },
  { value: 300, label: "After 5 minutes" },
  { value: 600, label: "After 10 minutes" },
];

const TABS = [
  { id: "stt", label: "Transcription" },
  { id: "speakers", label: "Speakers" },
  { id: "minutes", label: "Minutes" },
  { id: "llm", label: "LLM" },
  { id: "remote", label: "Remote access" },
  { id: "data", label: "Data" },
  { id: "appearance", label: "Appearance" },
  // Only shown to an administrator; see the tab bar below. Last, because it is the one tab that
  // is not about the reader.
  { id: "defaults", label: "Defaults for everyone" },
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
  // Edited as a whole, because a key typed into one entry must survive editing another.
  const [draftProfiles, setDraftProfiles] = useState<DraftProfile[]>([]);
  const [draftTemplates, setDraftTemplates] = useState<MinutesTemplate[]>([]);
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
      .then((data: PublicSettings) => {
        setSettings(data);
        setDraftProfiles(data.sttProfiles);
        setDraftTemplates(data.minutesTemplates);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"));
  }, []);

  const sttDest = settings ? sttDestination(settings) : null;
  const defaultProfile = settings?.sttProfiles.find((p) => p.id === settings.sttDefaultProfileId);

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
      // Everything the form holds, rather than a list of field names kept in step by hand.
      // The hand-written list is how the remote-transcription fields shipped unsaveable: they
      // were added to the type, the inputs and the API's allow-list, and left out of here, so
      // saving posted nothing for them and the reply -- the unchanged values -- overwrote what
      // had just been typed. The server picks what it accepts and ignores the rest, so a field
      // added above cannot go missing here again.
      const { hasAnthropicApiKey, hasOpenaiApiKey, ...rest } = settings;
      void hasAnthropicApiKey;
      void hasOpenaiApiKey;
      const body: Record<string, unknown> = {
        ...rest,
        sttProfiles: draftProfiles,
        minutesTemplates: draftTemplates,
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
      setDraftProfiles(next.sttProfiles);
      setDraftTemplates(next.minutesTemplates);
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
      <div className="mx-auto max-w-3xl space-y-6">
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
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-strong)]">Settings</h1>

      <form onSubmit={onSubmit} className="space-y-6">
        {/* Category tabs */}
        <div className="flex flex-wrap gap-1 border-b border-[var(--border)]">
          {/* The defaults tab is not the reader's own settings, so it is only offered to
              somebody who can change them for everybody. */}
          {TABS.filter((t) => t.id !== "defaults" || settings.isAdmin).map((t) => (
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

          <SttProfiles
            profiles={draftProfiles}
            defaultId={settings.sttDefaultProfileId}
            disabled={saving}
            localModel={settings.whisperModel}
            notice={sttDest ? <RemoteSttNotice host={sttDest} /> : null}
            localEditor={
              <>
                <label htmlFor="whisperModel" className={labelClass}>
                  Model
                </label>
                <select
                  id="whisperModel"
                  value={settings.whisperModel}
                  onChange={(e) => update("whisperModel", e.target.value)}
                  disabled={saving || !settings.isAdmin}
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
                <MachineNote isAdmin={settings.isAdmin} />
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  Roughly how much memory each needs: {modelSizeGuide()}. On an 8GB card this is
                  what has to fit beside whatever else is loaded. Downloaded on first use and
                  cached afterwards.
                </p>
                {whisperModel(settings.whisperModel)?.note ? (
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
                    {whisperModel(settings.whisperModel)!.note}
                  </p>
                ) : null}
                {/* Set as the default it applies to every meeting, so make the trade-off loud here. */}
                {/* With a remote endpoint configured, this picker still matters -- but not for
                    everything, and saying so is the difference between a control that looks broken
                    and one that is doing its job. */}
                {sttDest ? (
                  <p className="mt-1 text-xs text-[var(--text-secondary)]">
                    This model is used for <strong>live recognition on this machine</strong>. The
                    after-the-meeting pass and <em>Re-transcribe</em> use{" "}
                    <strong>{defaultProfile?.model || "the endpoint's model"}</strong> at {sttDest}{" "}
                    instead — these names belong to different services and are not interchangeable.
                  </p>
                ) : null}
                {isJapaneseOnlyModel(settings.whisperModel) ? (
                  <p className="mt-1 text-xs text-[var(--warning)]">
                    This is a Japanese-only model — meetings in other languages will not transcribe.
                    It becomes the default for every new meeting; you can still pick another model
                    per meeting on the New meeting screen.
                  </p>
                ) : null}
              </>
            }
            onChange={setDraftProfiles}
            onDefaultChange={(id) => update("sttDefaultProfileId", id)}
          />

          <div>
            <label htmlFor="vramBudgetMb" className={labelClass}>
              GPU budget for queued work
            </label>
            <input
              id="vramBudgetMb"
              type="number"
              min={0}
              step={512}
              value={settings.vramBudgetMb || ""}
              onChange={(e) => update("vramBudgetMb", Math.max(0, Number(e.target.value) || 0))}
              disabled={saving || !settings.isAdmin}
              placeholder="Auto — from the card, less room for the display"
              className={`${inputClass} max-w-sm`}
            />
            <MachineNote isAdmin={settings.isAdmin} />
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Megabytes of video memory the <em>queue</em> may commit at once. Leave it empty to
              work it out from the card. Jobs that run somewhere else — recognition sent to an
              endpoint, minutes written by a cloud model — cost nothing here and never wait for
              it.
            </p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              This is a scheduling figure, not a limit on any one job: something larger than the
              whole budget still runs, on its own. Raise it to let two things run together on a
              bigger card; lower it if something else on this machine needs the memory.
            </p>
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

          <MinutesTemplates
            templates={draftTemplates}
            defaultId={settings.defaultMinutesTemplateId}
            disabled={saving}
            onChange={setDraftTemplates}
            onDefaultChange={(id) => update("defaultMinutesTemplateId", id)}
          />
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

          <ExternalProviderNotice settings={settings} />

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
        {tab === "defaults" ? <HouseDefaults /> : null}

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

          <div>
            <label htmlFor="restScreenSeconds" className={labelClass}>
              Rest the screen while recording
            </label>
            <select
              id="restScreenSeconds"
              value={String(settings.restScreenSeconds)}
              onChange={(e) => update("restScreenSeconds", Number(e.target.value))}
              disabled={saving}
              className={`${inputClass} max-w-sm`}
            >
              {REST_SCREEN_CHOICES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              After this long without a touch, the recording screen goes black. Tapping brings
              it back, and it rests again after the same wait. Recording is not affected — the
              microphone, the upload and the screen lock all keep going.
            </p>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">
              On a phone with an OLED screen this is most of the battery: black pixels do not
              light up. <strong>You cannot watch the live transcript while it rests</strong>,
              which is the trade — worth it for a long meeting recorded from a pocket, not for
              one you are reading along with.
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
