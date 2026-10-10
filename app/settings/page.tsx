"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { TITLE_FORMATS } from "@/lib/meeting-title";
import { HouseDefaults } from "./house-defaults";
import { OllamaModelField } from "./ollama-model-field";
import { MachineNote } from "./machine-note";
import {
  WHISPER_MODELS,
  isJapaneseOnlyModel,
  isKnownWhisperModel,
  modelSizeGuide,
  whisperModel,
} from "@/lib/stt/models";
import { THEMES, readTheme, setTheme, watchSystemTheme, type Theme } from "@/lib/theme";
import { DataBackup } from "./data-backup";
import { ReminderNotifications } from "./reminder-notifications";
import { ExtensionsSettings } from "./extensions-settings";
import { useExtensions } from "../extensions-provider";
import { RestScreenSetting } from "./rest-screen-setting";
import { CheckIcon, StorageIcon } from "../icons";
import { RemoteAccess } from "./remote-access";
import { VoiceProfiles } from "./voice-profiles";
import { ExternalProviderNotice } from "./external-provider-notice";
import { RemoteSttNotice } from "./remote-stt-notice";
import { sttDestination } from "@/lib/stt/destination";
import { SttProfiles, type DraftProfile } from "./stt-profiles";
import { MinutesTemplates } from "./minutes-templates";
import type { MinutesTemplate } from "@/lib/minutes-templates";
import type { PublicSttProfile } from "@/lib/stt/profiles";
import { useT } from "@/app/locale-provider";

type PublicSettings = {
  /** Whether the reader may change the settings that describe the machine. */
  isAdmin: boolean;
  whisperModel: string;
  sttLanguage: string;
  sttGlossary: string;
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
  uiLanguage: string;
  meetingTitleFormat: string;
  summaryLanguage: string;
  vramBudgetMb: number;
};

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
const LLM_PROVIDERS: { id: PublicSettings["llmProvider"]; label: string }[] = [
  { id: "ollama", label: "Ollama (default)" },
  { id: "anthropic", label: "Anthropic (Claude API — sends your transcripts off this machine)" },
  { id: "openai", label: "OpenAI-compatible API (OpenAI, or a local server like LM Studio)" },
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
  { id: "extensions", label: "Extensions" },
  // Only shown to an administrator; see the tab bar below. Last, because it is the one tab that
  // is not about the reader.
  { id: "defaults", label: "Defaults for everyone" },
] as const;
type TabId = (typeof TABS)[number]["id"];


const inputClass = "input";
const labelClass = "label";

/**
 * The labels on this screen's option lists, spelled out so the table's test can find them.
 *
 * They live in module-level constants, which have no hook to reach the language with — the same
 * shape as the meeting list's bands and the minutes panel's providers.
 */
function settingLabel(t: (k: string) => string, label: string): string {
  const table: Record<string, string> = {
    Transcription: t("Transcription"),
    Speakers: t("Speakers"),
    Minutes: t("Minutes"),
    LLM: t("LLM"),
    "Remote access": t("Remote access"),
    Data: t("Data"),
    Appearance: t("Appearance"),
    Extensions: t("Extensions"),
    "Defaults for everyone": t("Defaults for everyone"),
    System: t("System"),
    Light: t("Light"),
    Dark: t("Dark"),
    "Brief (key points, shorter)": t("Brief (key points, shorter)"),
    Standard: t("Standard"),
    "Detailed (fuller for longer meetings)": t("Detailed (fuller for longer meetings)"),
    "Japanese (日本語)": t("Japanese (日本語)"),
    English: t("English"),
    "Chinese (中文)": t("Chinese (中文)"),
    "Auto-detect (keep the spoken language)": t("Auto-detect (keep the spoken language)"),
    "Japanese (fixed)": t("Japanese (fixed)"),
    "English (fixed)": t("English (fixed)"),
    "Ollama (default)": t("Ollama (default)"),
    "Anthropic (Claude API — sends your transcripts off this machine)":
      t("Anthropic (Claude API — sends your transcripts off this machine)"),
    "OpenAI-compatible API (OpenAI, or a local server like LM Studio)":
      t("OpenAI-compatible API (OpenAI, or a local server like LM Studio)"),
    // Whisper models. The name is an identifier and stays; the bracket is prose.
    "large-v3-turbo (default; fast and accurate)": t("large-v3-turbo (default; fast and accurate)"),
    "large-v3 (accurate)": t("large-v3 (accurate)"),
    "small (light)": t("small (light)"),
    "kotoba-whisper-v2.0 (Japanese only)": t("kotoba-whisper-v2.0 (Japanese only)"),
    // The note shown under the picker, from the same constant.
    "Distilled on Japanese speech — faster and more accurate for Japanese, but the transcription language is forced to Japanese, it adds little punctuation, and the glossary is skipped for it.":
      t("Distilled on Japanese speech — faster and more accurate for Japanese, but the transcription language is forced to Japanese, it adds little punctuation, and the glossary is skipped for it."),
  };
  return table[label] ?? label;
}

/**
 * One setting as a row of a table (v4, like a meeting's details): what it is at the left, the
 * control at the right, and under the control at most a line about it.
 */
function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-x-6 gap-y-1.5 border-b border-[var(--border)] py-4 last:border-b-0 sm:grid-cols-[11rem_minmax(0,1fr)]">
      {htmlFor ? (
        <label htmlFor={htmlFor} className="pt-2 text-sm text-[var(--text-secondary)]">
          {label}
        </label>
      ) : (
        <p className="pt-2 text-sm text-[var(--text-secondary)]">{label}</p>
      )}
      <div className="min-w-0">
        {children}
        {hint ? <div className="mt-1.5 space-y-1 text-xs text-[var(--text-muted)]">{hint}</div> : null}
      </div>
    </div>
  );
}

/** How long after the last change it is saved. Long enough not to save every keystroke. */
const SAVE_AFTER_MS = 700;

export default function SettingsPage() {
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const t = useT();
  const router = useRouter();
  const extensions = useExtensions();
  // Edited as a whole, because a key typed into one entry must survive editing another.
  const [draftProfiles, setDraftProfiles] = useState<DraftProfile[]>([]);
  const [draftTemplates, setDraftTemplates] = useState<MinutesTemplate[]>([]);
  const [anthropicApiKey, setAnthropicApiKey] = useState("");
  const [openaiApiKey, setOpenaiApiKey] = useState("");
  const [clearAnthropicApiKey, setClearAnthropicApiKey] = useState(false);
  const [clearOpenaiApiKey, setClearOpenaiApiKey] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>("stt");

  // Saved as it is changed (v4): there is no Save button. Every change counts up `edits`; a
  // moment after the last one, what the page holds is sent. A reply is applied only when nothing
  // was changed while it was on its way — otherwise it would put back what was just typed.
  const [edits, setEdits] = useState(0);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const latest = useRef(0);
  const edited = () => setEdits((n) => n + 1);

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
        // The tab in the address (?tab=data), from a reload or a link.
        const asked = new URLSearchParams(window.location.search).get("tab");
        const known = TABS.find((x) => x.id === asked);
        if (known && (known.id !== "defaults" || data.isAdmin)) setTab(known.id);
      })
      .catch((err) => setError(err instanceof Error ? err.message : t("Failed to load")));
  }, [t]);

  const sttDest = settings ? sttDestination(settings) : null;
  const defaultProfile = settings?.sttProfiles.find((p) => p.id === settings.sttDefaultProfileId);

  const update = <K extends keyof PublicSettings>(key: K, value: PublicSettings[K]) => {
    setSettings((prev) => (prev ? { ...prev, [key]: value } : prev));
    edited();
  };

  const save = async (version: number) => {
    if (!settings) return;
    latest.current = version;
    setError(null);
    setStatus("saving");
    try {
      // Everything the page holds, rather than a list of field names kept in step by hand.
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
      // Changed again while this was on its way: that change is saved next, and this reply would
      // only put back what it replaced.
      if (latest.current !== version) return;
      const languageChanged = next.uiLanguage !== uiLanguageShown.current;
      setSettings(next);
      setDraftProfiles(next.sttProfiles);
      setDraftTemplates(next.minutesTemplates);
      setAnthropicApiKey("");
      setOpenaiApiKey("");
      setClearAnthropicApiKey(false);
      setClearOpenaiApiKey(false);
      setStatus("saved");
      // The language is the server's to apply (the page is rendered in it): ask for the page
      // again, in place, rather than telling somebody to reload it.
      if (languageChanged) {
        uiLanguageShown.current = next.uiLanguage;
        router.refresh();
      }
    } catch (err) {
      if (latest.current !== version) return;
      setStatus("failed");
      setError(err instanceof Error ? err.message : t("Failed to save"));
    }
  };
  // The language the page was drawn in, to know when a save changed it.
  const uiLanguageShown = useRef<string | null>(null);
  useEffect(() => {
    if (settings && uiLanguageShown.current === null) uiLanguageShown.current = settings.uiLanguage;
  }, [settings]);

  // On a phone the categories are a row wider than the screen: keep the open one in sight.
  useEffect(() => {
    document.getElementById(`settings-tab-${tab}`)?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [tab, settings]);

  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  });
  useEffect(() => {
    if (edits === 0) return;
    const id = setTimeout(() => void saveRef.current(edits), SAVE_AFTER_MS);
    return () => clearTimeout(id);
  }, [edits]);

  if (!settings) {
    return (
      <div className="mx-auto max-w-5xl space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-strong)]">{t("Settings")}</h1>
        {error ? (
          <p className="text-sm text-[var(--error)]">{error}</p>
        ) : (
          <p className="text-sm text-[var(--text-muted)]">{t("Loading…")}</p>
        )}
      </div>
    );
  }

  const tabs = TABS.filter(
    (tab_) =>
      (tab_.id !== "defaults" || settings.isAdmin) &&
      (tab_.id !== "remote" || extensions.externalShare) &&
      (tab_.id !== "speakers" || extensions.speakers),
  );

  return (
    <div data-paper className="mx-auto max-w-5xl space-y-5 pt-2 lg:pt-6">
      <div className="flex items-center gap-3">
        <h1 className="min-w-0 flex-1 text-2xl font-semibold tracking-tight text-[var(--text-strong)]">
          {t("Settings")}
        </h1>
        {/* Where the last change stands. Nothing before the first one: there is nothing to say. */}
        <p aria-live="polite" className="text-xs">
          {status === "saving" ? (
            <span className="text-[var(--text-muted)]">{t("Saving…")}</span>
          ) : status === "saved" ? (
            <span className="inline-flex items-center gap-1 text-[var(--success)]">
              <CheckIcon className="h-3.5 w-3.5" />
              {t("Saved")}
            </span>
          ) : status === "failed" ? (
            <span className="text-[var(--error)]">{t("Not saved")}</span>
          ) : null}
        </p>
      </div>
      {error ? <p className="text-sm text-[var(--error)]">{error}</p> : null}

      {/* The categories in a grey column of their own, the settings on the white page beside
          them — two things, so two surfaces. On a phone the categories are a row to scroll. */}
      <div className="lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:items-start lg:gap-8">
        <nav
          aria-label={t("Settings")}
          className="-mx-4 mb-5 flex gap-1 overflow-x-auto bg-[var(--panel)] px-4 py-2 lg:sticky lg:top-6 lg:mx-0 lg:mb-0 lg:flex-col lg:rounded-xl lg:p-2"
        >
          {tabs.map((tab_) => (
            <button
              key={tab_.id}
              type="button"
              onClick={() => {
                setTab(tab_.id);
                // Replaced, not pushed: switching tabs is not going somewhere, so Back still
                // leaves Settings. The address just says which tab, for a reload or a link.
                const url = new URL(window.location.href);
                if (tab_.id === "stt") url.searchParams.delete("tab");
                else url.searchParams.set("tab", tab_.id);
                window.history.replaceState(null, "", `${url.pathname}${url.search}`);
              }}
              id={`settings-tab-${tab_.id}`}
              aria-current={tab === tab_.id ? "page" : undefined}
              className={`shrink-0 whitespace-nowrap rounded-md px-3 py-2 text-left text-sm ${
                tab === tab_.id
                  ? "bg-[var(--surface)] font-medium text-[var(--text-strong)] shadow-sm"
                  : "text-[var(--text-secondary)] hover:bg-[var(--hover-surface)] hover:text-[var(--foreground)]"
              }`}
            >
              {settingLabel(t, tab_.label)}
            </button>
          ))}
        </nav>

        <div className="min-w-0">
          <h2 className="mb-1 text-lg font-semibold text-[var(--text-strong)]">
            {settingLabel(t, TABS.find((x) => x.id === tab)!.label)}
          </h2>

          {/* Transcription */}
          {tab === "stt" ? (
            <section>
              <Field label={t("Recognition")}>
                <SttProfiles
                  profiles={draftProfiles}
                  defaultId={settings.sttDefaultProfileId}
                  disabled={false}
                  localModel={settings.whisperModel}
                  notice={sttDest ? <RemoteSttNotice host={sttDest} /> : null}
                  endpoints={extensions.externalAi}
                  localEditor={
                    <>
                      <label htmlFor="whisperModel" className={labelClass}>
                        {t("Model")}
                      </label>
                      <select
                        id="whisperModel"
                        value={settings.whisperModel}
                        onChange={(e) => update("whisperModel", e.target.value)}
                        disabled={!settings.isAdmin}
                        className={inputClass}
                      >
                        {WHISPER_MODELS.map((m) => (
                          <option key={m.value} value={m.value}>
                            {settingLabel(t, m.label)}
                          </option>
                        ))}
                        {isKnownWhisperModel(settings.whisperModel) ? null : (
                          <option value={settings.whisperModel}>
                            {t("{model} (custom)", { model: settings.whisperModel })}
                          </option>
                        )}
                      </select>
                      <MachineNote isAdmin={settings.isAdmin} />
                      <p className="mt-1 text-xs text-[var(--text-muted)]">
                        {t("Memory each needs: {guide}. Downloaded on first use.", { guide: modelSizeGuide() })}
                      </p>
                      {whisperModel(settings.whisperModel)?.note ? (
                        <p className="mt-1 text-xs text-[var(--text-muted)]">
                          {settingLabel(t, whisperModel(settings.whisperModel)!.note!)}
                        </p>
                      ) : null}
                      {/* With a remote endpoint configured, this picker still matters -- but not
                          for everything, and saying so is the difference between a control that
                          looks broken and one that is doing its job. */}
                      {sttDest ? (
                        <p className="mt-1 text-xs text-[var(--text-secondary)]">
                          {t("Live recognition uses this model; after the meeting and Re-transcribe use {model} at {host}.", {
                            model: defaultProfile?.model || t("the endpoint’s model"),
                            host: sttDest,
                          })}
                        </p>
                      ) : null}
                      {isJapaneseOnlyModel(settings.whisperModel) ? (
                        <p className="mt-1 text-xs text-[var(--warning)]">
                          {t("This is a Japanese-only model — meetings in other languages will not transcribe.")}
                        </p>
                      ) : null}
                    </>
                  }
                  onChange={(p) => {
                    setDraftProfiles(p);
                    edited();
                  }}
                  onDefaultChange={(id) => update("sttDefaultProfileId", id)}
                />
              </Field>

              <Field label={t("Transcription language")} htmlFor="sttLanguage" hint={t("Auto-detect keeps the language that was spoken.")}>
                <select
                  id="sttLanguage"
                  value={settings.sttLanguage}
                  onChange={(e) => update("sttLanguage", e.target.value)}
                  className={inputClass}
                >
                  {STT_LANGUAGES.map((l) => (
                    <option key={l.id} value={l.id}>
                      {settingLabel(t, l.label)}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label={t("Glossary")} htmlFor="sttGlossary" hint={t("Names and terms to expect. Keep it short — about 150 characters.")}>
                <textarea
                  id="sttGlossary"
                  value={settings.sttGlossary}
                  onChange={(e) => update("sttGlossary", e.target.value)}
                  rows={2}
                  placeholder={t("e.g. Acme Corp, Project Aurora, Jane Doe, Voxinq Meeting")}
                  className="input resize-y"
                />
              </Field>

              {extensions.translation ? (
                <Field
                  label={t("Japanese translation")}
                  hint={t("Under each non-Japanese line. Runs on the CPU; a 1.2 GB model is downloaded on first use.")}
                >
                  <label className="flex items-center gap-2 pt-2 text-sm text-[var(--text-secondary)]">
                    <input
                      type="checkbox"
                      checked={settings.sttTranslate}
                      onChange={(e) => update("sttTranslate", e.target.checked)}
                      className="h-4 w-4 accent-[var(--accent)]"
                    />
                    {t("Translate non-Japanese speech into Japanese")}
                  </label>
                </Field>
              ) : null}

              <Field
                label={t("GPU budget for queued work")}
                htmlFor="vramBudgetMb"
                hint={
                  <>
                    <MachineNote isAdmin={settings.isAdmin} />
                    <p>{t("Megabytes of video memory queued work may use at once. Empty: worked out from the card.")}</p>
                  </>
                }
              >
                <input
                  id="vramBudgetMb"
                  type="number"
                  min={0}
                  step={512}
                  value={settings.vramBudgetMb || ""}
                  onChange={(e) => update("vramBudgetMb", Math.max(0, Number(e.target.value) || 0))}
                  disabled={!settings.isAdmin}
                  placeholder={t("Auto")}
                  className={`${inputClass} max-w-xs`}
                />
              </Field>
            </section>
          ) : null}

          {/* Voice profiles (speaker auto-naming) */}
          {tab === "speakers" && extensions.speakers ? <VoiceProfiles /> : null}

          {/* Minutes (language, background, format) */}
          {tab === "minutes" ? (
            <section>
              <Field label={t("Minutes language")} htmlFor="summaryLanguage" hint={t("Whatever language was spoken.")}>
                <select
                  id="summaryLanguage"
                  value={settings.summaryLanguage}
                  onChange={(e) => update("summaryLanguage", e.target.value)}
                  className={inputClass}
                >
                  {SUMMARY_LANGUAGES.map((l) => (
                    <option key={l.id} value={l.id}>
                      {settingLabel(t, l.label)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                label={t("Background")}
                htmlFor="llmBackground"
                hint={t("Read with every meeting's minutes, to understand its terms — never copied into them. Half a page to a page.")}
              >
                <textarea
                  id="llmBackground"
                  value={settings.llmBackground}
                  onChange={(e) => update("llmBackground", e.target.value)}
                  rows={6}
                  placeholder={t("Your organisation, projects and people.")}
                  className="input resize-y"
                />
              </Field>
              {extensions.minutesFormats ? (
                <Field label={t("Formats")}>
                  <MinutesTemplates
                    templates={draftTemplates}
                    defaultId={settings.defaultMinutesTemplateId}
                    disabled={false}
                    onChange={(next) => {
                      setDraftTemplates(next);
                      edited();
                    }}
                    onDefaultChange={(id) => update("defaultMinutesTemplateId", id)}
                  />
                </Field>
              ) : null}
            </section>
          ) : null}

          {/* LLM */}
          {tab === "llm" ? (
            <section>
              {/* Without External AI, Ollama is the only writer: no choice, and nothing sent away. */}
              {extensions.externalAi ? (
                <Field label={t("Provider")} htmlFor="llmProvider" hint={<ExternalProviderNotice settings={settings} />}>
                  <select
                    id="llmProvider"
                    value={settings.llmProvider}
                    onChange={(e) => update("llmProvider", e.target.value as PublicSettings["llmProvider"])}
                    className={inputClass}
                  >
                    {LLM_PROVIDERS.map((p) => (
                      <option key={p.id} value={p.id}>
                        {settingLabel(t, p.label)}
                      </option>
                    ))}
                  </select>
                </Field>
              ) : null}

              {/* Only the one in use: the other two were boxes of fields that did nothing. */}
              {settings.llmProvider === "ollama" || !extensions.externalAi ? (
                <>
                  <Field label={t("Ollama address")} htmlFor="ollamaBaseUrl">
                    <input
                      id="ollamaBaseUrl"
                      type="text"
                      value={settings.ollamaBaseUrl}
                      onChange={(e) => update("ollamaBaseUrl", e.target.value)}
                      placeholder="http://127.0.0.1:11434"
                      className={inputClass}
                    />
                  </Field>
                  <Field label={t("Ollama model")}>
                    <OllamaModelField
                      baseUrl={settings.ollamaBaseUrl}
                      model={settings.ollamaModel}
                      onChange={(v) => update("ollamaModel", v)}
                      isAdmin={settings.isAdmin}
                      inputClass={inputClass}
                      labelClass="sr-only"
                    />
                  </Field>
                </>
              ) : settings.llmProvider === "anthropic" ? (
                <>
                  <Field label={t("Model")} htmlFor="anthropicModel">
                    <input
                      id="anthropicModel"
                      type="text"
                      value={settings.anthropicModel}
                      onChange={(e) => update("anthropicModel", e.target.value)}
                      placeholder="claude-sonnet-4-6"
                      className={inputClass}
                    />
                  </Field>
                  <Field label={t("API key")} htmlFor="anthropicApiKey">
                    <input
                      id="anthropicApiKey"
                      type="password"
                      value={anthropicApiKey}
                      onChange={(e) => {
                        setAnthropicApiKey(e.target.value);
                        edited();
                      }}
                      placeholder={settings.hasAnthropicApiKey ? t("Set (enter only to change)") : t("Not set")}
                      autoComplete="off"
                      className={inputClass}
                    />
                    {settings.hasAnthropicApiKey ? (
                      <label className="mt-2 flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                        <input
                          type="checkbox"
                          checked={clearAnthropicApiKey}
                          onChange={(e) => {
                            setClearAnthropicApiKey(e.target.checked);
                            edited();
                          }}
                          className="accent-[var(--error)]"
                        />
                        {t("Delete the saved key")}
                      </label>
                    ) : null}
                  </Field>
                </>
              ) : (
                <>
                  <Field label={t("Base URL")} htmlFor="openaiBaseUrl">
                    <input
                      id="openaiBaseUrl"
                      type="text"
                      value={settings.openaiBaseUrl}
                      onChange={(e) => update("openaiBaseUrl", e.target.value)}
                      placeholder="https://api.openai.com/v1"
                      className={inputClass}
                    />
                  </Field>
                  <Field label={t("Model")} htmlFor="openaiModel">
                    <input
                      id="openaiModel"
                      type="text"
                      value={settings.openaiModel}
                      onChange={(e) => update("openaiModel", e.target.value)}
                      placeholder="gpt-4o-mini"
                      className={inputClass}
                    />
                  </Field>
                  <Field label={t("API key")} htmlFor="openaiApiKey" hint={t("Leave it empty for a local server.")}>
                    <input
                      id="openaiApiKey"
                      type="password"
                      value={openaiApiKey}
                      onChange={(e) => {
                        setOpenaiApiKey(e.target.value);
                        edited();
                      }}
                      placeholder={settings.hasOpenaiApiKey ? t("Set (enter only to change)") : t("Not set")}
                      autoComplete="off"
                      className={inputClass}
                    />
                    {settings.hasOpenaiApiKey ? (
                      <label className="mt-2 flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                        <input
                          type="checkbox"
                          checked={clearOpenaiApiKey}
                          onChange={(e) => {
                            setClearOpenaiApiKey(e.target.checked);
                            edited();
                          }}
                          className="accent-[var(--error)]"
                        />
                        {t("Delete the saved key")}
                      </label>
                    ) : null}
                  </Field>
                </>
              )}
            </section>
          ) : null}

          {/* Remote access (Tailscale Funnel publish toggle) */}
          {tab === "remote" && extensions.externalShare ? <RemoteAccess /> : null}

          {tab === "extensions" ? <ExtensionsSettings isAdmin={settings.isAdmin} /> : null}

          {tab === "data" ? (
            <section className="space-y-6">
              {/* Also in the account menu; this is the way in on an instance without accounts. */}
              <Field label={t("Storage")}>
                <Link href="/storage" className="inline-flex items-center gap-2 pt-2 text-sm text-[var(--accent-sub)] hover:underline">
                  <StorageIcon className="h-4 w-4 shrink-0" />
                  {t("How much room the recordings, transcripts and minutes take")}
                </Link>
              </Field>
              <DataBackup />
            </section>
          ) : null}

          {tab === "defaults" ? <HouseDefaults /> : null}

          {tab === "appearance" ? (
            <section>
              <Field label={t("Theme")} hint={t("This device only. System follows the OS.")}>
                <div className="grid max-w-sm grid-cols-3 gap-2">
                  {THEMES.map((th) => (
                    <button
                      key={th.id}
                      type="button"
                      onClick={() => applyTheme(th.id)}
                      aria-pressed={theme === th.id}
                      className={`rounded-md border px-3 py-2 text-sm ${
                        theme === th.id
                          ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] text-[var(--accent-sub)]"
                          : "border-[var(--border-strong)] text-[var(--text-secondary)] hover:border-[var(--accent)]"
                      }`}
                    >
                      {settingLabel(t, th.label)}
                    </button>
                  ))}
                </div>
              </Field>

              <Field label={t("Language")} htmlFor="uiLanguage" hint={t("Of the screens. The minutes' language is under Minutes.")}>
                <select
                  id="uiLanguage"
                  value={settings.uiLanguage}
                  onChange={(e) => update("uiLanguage", e.target.value)}
                  className={inputClass}
                >
                  <option value="auto">{t("Follow my browser")}</option>
                  <option value="en">{t("English")}</option>
                  <option value="ja">日本語</option>
                </select>
              </Field>

              <Field
                label={t("Default meeting name")}
                htmlFor="meetingTitleFormat"
                hint={t("Until somebody names it. A booked meeting is named for its day.")}
              >
                <select
                  id="meetingTitleFormat"
                  value={settings.meetingTitleFormat}
                  onChange={(e) => update("meetingTitleFormat", e.target.value)}
                  className={inputClass}
                >
                  {/* The samples are the labels. Which of `20260711` and `Jul 11, 2026` reads as
                      a date is a question about where somebody lives, and the way to answer it is
                      to look at both rather than to decode `yyyyMMdd`. */}
                  {TITLE_FORMATS.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.sample}
                    </option>
                  ))}
                </select>
              </Field>

              {/* Per device, like the theme: a phone in a pocket and a laptop on the table want
                  different answers (app/rest-screen.ts). */}
              <Field label={t("Rest the screen")}>
                <RestScreenSetting labelClass="sr-only" inputClass={inputClass} />
              </Field>

              {/* Per device, like the theme above it. */}
              {extensions.schedule ? (
                <div className="pt-4">
                  <ReminderNotifications />
                </div>
              ) : null}
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
