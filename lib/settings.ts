// Persistence of runtime settings (server-only).
// Saved to settings.json at the project root so they can be changed from the settings UI without env restarts.
// Single on-prem user is assumed, so API keys are also stored in plaintext in the same file (gitignored).
// Keys with no value fall back in order: environment variable -> hardcoded default.

import { promises as fs } from "fs";
import path from "path";
import type { LlmConfig, LlmProviderName } from "./llm/types";

const SETTINGS_PATH = path.join(process.cwd(), "settings.json");

export type AppSettings = {
  // STT
  whisperModel: string;
  sttLanguage: string; // "auto" | "ja" | "en" (auto = keep the spoken language)
  sttGlossary: string; // terms/proper nouns for Whisper initial_prompt (short text)
  micMode: string; // "standard" | "room" (room = tuned to pick up distant voices in a meeting room)
  // LLM
  llmProvider: LlmProviderName;
  ollamaBaseUrl: string;
  ollamaModel: string;
  anthropicModel: string;
  anthropicApiKey: string;
  openaiBaseUrl: string;
  openaiModel: string;
  openaiApiKey: string;
  llmBackground: string; // business background shared across all meetings for the minutes LLM (long text)
  summaryFormat: string; // minutes format spec (user-specified, takes priority)
  summaryLanguage: string; // minutes output language "ja" | "en" | "zh" (generated in this language regardless of speech)
  summaryDetail: string; // minutes verbosity "brief" | "standard" | "detailed" (controls output length + guidance)
};

function defaults(): AppSettings {
  return {
    whisperModel: process.env.WHISPER_MODEL ?? "large-v3-turbo",
    sttLanguage: process.env.WHISPER_LANGUAGE ?? "auto",
    sttGlossary: "",
    micMode: "standard",
    llmProvider: ((process.env.LLM_PROVIDER ?? "ollama").toLowerCase() as LlmProviderName) || "ollama",
    ollamaBaseUrl: process.env.OLLAMA_BASE_URL ?? "http://localhost:11434",
    ollamaModel: process.env.OLLAMA_MODEL ?? "qwen2.5:7b-instruct",
    anthropicModel: process.env.ANTHROPIC_MODEL ?? process.env.CLAUDE_MODEL ?? "claude-sonnet-4-6",
    anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
    openaiBaseUrl: process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
    openaiModel: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    openaiApiKey: process.env.OPENAI_API_KEY ?? "",
    llmBackground: "",
    summaryFormat: "",
    summaryLanguage: process.env.SUMMARY_LANGUAGE ?? "ja",
    summaryDetail: process.env.SUMMARY_DETAIL ?? "standard",
  };
}

const VALID_STT_LANGUAGES = ["auto", "ja", "en"];
const VALID_SUMMARY_LANGUAGES = ["ja", "en", "zh"];
const VALID_SUMMARY_DETAILS = ["brief", "standard", "detailed"];
const VALID_MIC_MODES = ["standard", "room"];

const VALID_PROVIDERS: LlmProviderName[] = ["ollama", "anthropic", "openai"];

export async function readSettings(): Promise<AppSettings> {
  const base = defaults();
  try {
    const raw = await fs.readFile(SETTINGS_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    const merged = { ...base, ...stripUndefined(parsed) };
    if (!VALID_PROVIDERS.includes(merged.llmProvider)) merged.llmProvider = base.llmProvider;
    if (!VALID_STT_LANGUAGES.includes(merged.sttLanguage)) merged.sttLanguage = base.sttLanguage;
    if (!VALID_SUMMARY_LANGUAGES.includes(merged.summaryLanguage))
      merged.summaryLanguage = base.summaryLanguage;
    if (!VALID_SUMMARY_DETAILS.includes(merged.summaryDetail))
      merged.summaryDetail = base.summaryDetail;
    if (!VALID_MIC_MODES.includes(merged.micMode)) merged.micMode = base.micMode;
    return merged;
  } catch {
    // If the file is missing or corrupted, use defaults.
    return base;
  }
}

export async function writeSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const current = await readSettings();
  const next = { ...current, ...stripUndefined(patch) };
  if (!VALID_PROVIDERS.includes(next.llmProvider)) next.llmProvider = current.llmProvider;
  await fs.writeFile(SETTINGS_PATH, JSON.stringify(next, null, 2), "utf8");
  return next;
}

function stripUndefined<T extends object>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

/** Convert to LlmConfig for lib/llm. */
export async function getLlmConfig(): Promise<LlmConfig> {
  const s = await readSettings();
  return {
    provider: s.llmProvider,
    ollamaBaseUrl: s.ollamaBaseUrl,
    ollamaModel: s.ollamaModel,
    anthropicApiKey: s.anthropicApiKey || undefined,
    anthropicModel: s.anthropicModel,
    openaiApiKey: s.openaiApiKey || undefined,
    openaiBaseUrl: s.openaiBaseUrl,
    openaiModel: s.openaiModel,
  };
}

export async function getWhisperModel(): Promise<string> {
  return (await readSettings()).whisperModel;
}

/** Business background always passed to the minutes LLM (empty string if unset). */
export async function getLlmBackground(): Promise<string> {
  return (await readSettings()).llmBackground?.trim() ?? "";
}

/** User-specified minutes format (empty string if unset). */
export async function getSummaryFormat(): Promise<string> {
  return (await readSettings()).summaryFormat?.trim() ?? "";
}

/** Minutes output language (defaults to "ja" if unset). */
export async function getSummaryLanguage(): Promise<string> {
  return (await readSettings()).summaryLanguage || "ja";
}

/** Minutes verbosity level (defaults to "standard"). */
export async function getSummaryDetail(): Promise<string> {
  return (await readSettings()).summaryDetail || "standard";
}

/** Client-safe representation with API keys hidden. */
export type PublicSettings = Omit<AppSettings, "anthropicApiKey" | "openaiApiKey"> & {
  hasAnthropicApiKey: boolean;
  hasOpenaiApiKey: boolean;
};

export function toPublic(s: AppSettings): PublicSettings {
  const { anthropicApiKey, openaiApiKey, ...rest } = s;
  return {
    ...rest,
    hasAnthropicApiKey: Boolean(anthropicApiKey),
    hasOpenaiApiKey: Boolean(openaiApiKey),
  };
}
