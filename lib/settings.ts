// Persistence of runtime settings (server-only).
// Saved to settings.json at the project root so they can be changed from the settings UI without env restarts.
// Single on-prem user is assumed, so API keys are also stored in plaintext in the same file (gitignored).
// Keys with no value fall back in order: environment variable -> hardcoded default.

import { promises as fs } from "fs";
import path from "path";
import type { LlmConfig, LlmProviderName } from "./llm/types";
import {
  type MinutesTemplate,
  migrateMinutesTemplates,
  normalizeTemplates,
} from "./minutes-templates";
import {
  type SttProfile,
  type PublicSttProfile,
  nameFromBaseUrl,
  normalizeProfiles,
  publicProfile,
} from "./stt/profiles";

// Overridable so a container can keep settings on a mounted volume. Bind-mounting a single
// file would be the obvious alternative, but Docker silently creates a *directory* when the
// host file does not exist yet, which leaves saving from the Settings UI broken.
const SETTINGS_PATH =
  process.env.VOXINQ_SETTINGS_PATH ?? path.join(process.cwd(), "settings.json");

export type AppSettings = {
  // STT
  whisperModel: string;
  sttLanguage: string; // "auto" | "ja" | "en" (auto = keep the spoken language)
  sttGlossary: string; // terms/proper nouns for Whisper initial_prompt (short text)
  micMode: string; // "standard" | "room" (room = tuned to pick up distant voices in a meeting room)
  // Translate non-Japanese utterances into Japanese alongside the transcript. Off by default:
  // it downloads a ~600MB CC-BY-NC translation model to the STT host on first use.
  sttTranslate: boolean;
  // Where speech is recognised. "local" runs it on the STT host, picking an engine from the
  // hardware. "remote" posts the audio to an OpenAI-compatible /v1/audio/transcriptions --
  // which is a cloud provider or a whisper server of your own, depending on the URL. Empty
  // fields fall back to the STT service's own STT_BACKEND / STT_CLOUD_* environment, so an
  // install configured entirely from .env keeps working without opening this screen.
  /**
   * Saved recognition endpoints. Empty means everything happens on this machine, which is the
   * default and the usual case.
   *
   * A list rather than one endpoint because choosing a remote one used to mean you could no
   * longer re-transcribe locally: a single setting answered "where does recognition happen"
   * for everything, when the answer is "wherever you pick, this time".
   */
  sttProfiles: SttProfile[];
  /** Which profile new work uses when nothing else is chosen. Empty = this machine. */
  sttDefaultProfileId: string;
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
  /**
   * Saved minutes formats. Empty means the built-in one, which is the default and the usual
   * case. A list because a lecture is not a meeting: the same headings produce empty sections.
   */
  minutesTemplates: MinutesTemplate[];
  /** Which template new minutes use when nothing else is chosen. Empty = the built-in. */
  defaultMinutesTemplateId: string;
  summaryLanguage: string; // minutes output language "ja" | "en" | "zh" (generated in this language regardless of speech)
  summaryDetail: string; // minutes verbosity "brief" | "standard" | "detailed" (controls output length + guidance)
  /**
   * What the queue may run at once, in MB of video memory. 0 = work it out from the card.
   *
   * An estimate is a guess about someone else's machine. The number is derived from what
   * nvidia-smi reports, less headroom for the display — but the person sitting at the machine
   * knows what else is on the card, and setting it here overrides the guess entirely.
   */
  vramBudgetMb: number;
  /**
   * Seconds of no interaction before the recording screen goes black. 0 = never.
   *
   * A phone recording a meeting has to keep its screen on -- when it sleeps the page is
   * suspended and the microphone stops -- and the screen is what empties the battery. Black
   * pixels on an OLED panel do not emit, so a black screen with the wake lock still held costs
   * a fraction of a lit one, and the recording is untouched by it.
   *
   * Never by default: it hides the live transcript, which on that screen is the thing people
   * are watching. Someone recording a long meeting from a pocket wants it; someone following
   * along does not.
   */
  restScreenSeconds: number;
  voiceprintThreshold: number; // cosine similarity needed to auto-name a diarized speaker from a voice profile (0..1)
  // Ollama context window in tokens. 0 = use the built-in budget, which is what fits beside a
  // 7B model on 8 GB of VRAM. Raise it on a bigger card: it is a VRAM figure, not a model
  // limit, and asking for more than the card holds makes Ollama spill to the CPU instead of
  // failing — many times slower, with nothing to say why. See lib/llm/context.ts.
  ollamaNumCtx: number;
};

function defaults(): AppSettings {
  return {
    whisperModel: process.env.WHISPER_MODEL ?? "large-v3-turbo",
    sttLanguage: process.env.WHISPER_LANGUAGE ?? "auto",
    sttGlossary: "",
    micMode: "standard",
    sttTranslate: false,
    // Seeded from the environment so an install can come up already configured; see
    // migrateSttSettings for what happens to a single endpoint saved before profiles existed.
    sttProfiles: envProfile(),
    sttDefaultProfileId: (process.env.STT_BACKEND ?? "").trim() ? ENV_PROFILE_ID : "",
    llmProvider: ((process.env.LLM_PROVIDER ?? "ollama").toLowerCase() as LlmProviderName) || "ollama",
    // 127.0.0.1, not localhost: on Windows `localhost` prefers ::1, so a container publishing
    // the same port on IPv6 would answer instead of the local Ollama.
    ollamaBaseUrl: process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434",
    ollamaModel: process.env.OLLAMA_MODEL ?? "qwen2.5:7b-instruct",
    anthropicModel: process.env.ANTHROPIC_MODEL ?? process.env.CLAUDE_MODEL ?? "claude-sonnet-4-6",
    anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
    openaiBaseUrl: process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
    openaiModel: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    openaiApiKey: process.env.OPENAI_API_KEY ?? "",
    llmBackground: "",
    minutesTemplates: [],
    defaultMinutesTemplateId: "",
    summaryLanguage: process.env.SUMMARY_LANGUAGE ?? "ja",
    summaryDetail: process.env.SUMMARY_DETAIL ?? "standard",
    vramBudgetMb: 0,
    restScreenSeconds: 0,
    voiceprintThreshold: 0.5,
    ollamaNumCtx: 0,
  };
}

const VALID_STT_LANGUAGES = ["auto", "ja", "en"];
const VALID_SUMMARY_LANGUAGES = ["ja", "en", "zh"];
const VALID_SUMMARY_DETAILS = ["brief", "standard", "detailed"];
const VALID_MIC_MODES = ["standard", "room"];
// A list rather than a range: these are the choices the settings screen offers, and a value
// from anywhere else is a mistake worth ignoring rather than honouring. 0 = never.
export const VALID_REST_SCREEN_SECONDS = [0, 30, 60, 300, 600];

const VALID_PROVIDERS: LlmProviderName[] = ["ollama", "anthropic", "openai"];

// The environment still seeds one endpoint, for an install configured entirely from .env.
const ENV_PROFILE_ID = "env";

function envProfile(): SttProfile[] {
  const baseUrl = (process.env.STT_CLOUD_BASE_URL ?? "").trim();
  if (!baseUrl) return [];
  return [
    {
      id: ENV_PROFILE_ID,
      name: nameFromBaseUrl(baseUrl),
      kind: "openai",
      baseUrl,
      model: (process.env.STT_CLOUD_MODEL ?? "whisper-large-v3-turbo").trim(),
      apiKey: process.env.STT_CLOUD_API_KEY ?? "",
    },
  ];
}

/**
 * Bring a settings file written before profiles existed up to date.
 *
 * The single-endpoint fields are converted, never dropped. An install with one configured and
 * working must not lose it on upgrade -- and losing it would be silent, because recognition
 * would simply start happening locally again with nothing to say why.
 *
 * It becomes the default only if it was the one in use. Someone who had filled the fields in
 * and left the provider on "local" was not using it, and turning it on for them would start
 * uploading audio they had not asked to upload.
 */
export function migrateSttSettings(parsed: Record<string, unknown>): {
  sttProfiles: SttProfile[];
  sttDefaultProfileId: string;
} | null {
  const profiles = normalizeProfiles(parsed.sttProfiles);
  if (profiles.length > 0) return null; // already migrated

  const baseUrl = typeof parsed.sttRemoteBaseUrl === "string" ? parsed.sttRemoteBaseUrl.trim() : "";
  if (!baseUrl) return null;

  const migrated: SttProfile = {
    id: "migrated",
    name: nameFromBaseUrl(baseUrl),
    kind: "openai",
    baseUrl,
    model:
      (typeof parsed.sttRemoteModel === "string" ? parsed.sttRemoteModel.trim() : "") ||
      "whisper-large-v3-turbo",
    apiKey: typeof parsed.sttRemoteApiKey === "string" ? parsed.sttRemoteApiKey : "",
  };
  return {
    sttProfiles: [migrated],
    sttDefaultProfileId: parsed.sttProvider === "remote" ? migrated.id : "",
  };
}

export async function readSettings(): Promise<AppSettings> {
  const base = defaults();
  try {
    const raw = await fs.readFile(SETTINGS_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    const merged = { ...base, ...stripUndefined(parsed) };
    // Profiles are validated rather than trusted: this file is hand-editable, and a malformed
    // entry should be ignored rather than reaching the code that builds a request from it.
    merged.sttProfiles = normalizeProfiles(merged.sttProfiles);
    merged.minutesTemplates = normalizeTemplates(merged.minutesTemplates);
    const templates = migrateMinutesTemplates(parsed as Record<string, unknown>);
    if (templates) Object.assign(merged, templates);
    if (!merged.minutesTemplates.some((t) => t.id === merged.defaultMinutesTemplateId)) {
      merged.defaultMinutesTemplateId = "";
    }
    const migration = migrateSttSettings(parsed as Record<string, unknown>);
    if (migration) Object.assign(merged, migration);
    // Drop the fields profiles replaced. The spread above carries through whatever the file
    // holds, so leaving them would keep a *raw API key* on the object that toPublic hands to
    // the browser -- it strips the keys it knows about, and these are no longer among them.
    for (const legacy of ["sttProvider", "sttRemoteBaseUrl", "sttRemoteApiKey", "sttRemoteModel", "summaryFormat"]) {
      delete (merged as Record<string, unknown>)[legacy];
    }
    if (!merged.sttProfiles.some((p) => p.id === merged.sttDefaultProfileId)) {
      merged.sttDefaultProfileId = "";
    }
    if (!VALID_PROVIDERS.includes(merged.llmProvider)) merged.llmProvider = base.llmProvider;
    if (!VALID_STT_LANGUAGES.includes(merged.sttLanguage)) merged.sttLanguage = base.sttLanguage;
    if (!VALID_SUMMARY_LANGUAGES.includes(merged.summaryLanguage))
      merged.summaryLanguage = base.summaryLanguage;
    if (!VALID_SUMMARY_DETAILS.includes(merged.summaryDetail))
      merged.summaryDetail = base.summaryDetail;
    if (!VALID_MIC_MODES.includes(merged.micMode)) merged.micMode = base.micMode;
    if (typeof merged.sttTranslate !== "boolean") merged.sttTranslate = base.sttTranslate;
    // Nonsense is worse than the estimate it overrides: a budget of 12 MB is a queue that
    // never moves, and a negative one is a typo.
    if (
      typeof merged.vramBudgetMb !== "number" ||
      !Number.isFinite(merged.vramBudgetMb) ||
      merged.vramBudgetMb < 0 ||
      (merged.vramBudgetMb > 0 && merged.vramBudgetMb < 512)
    ) {
      merged.vramBudgetMb = base.vramBudgetMb;
    }
    if (!VALID_REST_SCREEN_SECONDS.includes(merged.restScreenSeconds)) {
      merged.restScreenSeconds = base.restScreenSeconds;
    }
    if (
      typeof merged.voiceprintThreshold !== "number" ||
      !(merged.voiceprintThreshold > 0 && merged.voiceprintThreshold < 1)
    ) {
      merged.voiceprintThreshold = base.voiceprintThreshold;
    }
    // Below 2048 there is not room for the instructions, let alone a transcript; a number that
    // small is a mistake rather than a choice, so fall back rather than generate garbage.
    if (
      typeof merged.ollamaNumCtx !== "number" ||
      !Number.isFinite(merged.ollamaNumCtx) ||
      (merged.ollamaNumCtx !== 0 && merged.ollamaNumCtx < 2048)
    ) {
      merged.ollamaNumCtx = base.ollamaNumCtx;
    }
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
  // A default pointing at something the same save removed. readSettings clears this too, but
  // only on the way out: without it here the reply to the save still names the deleted entry,
  // and the file keeps a dangling id until something else happens to rewrite it.
  if (!next.sttProfiles.some((p) => p.id === next.sttDefaultProfileId)) {
    next.sttDefaultProfileId = "";
  }
  if (!next.minutesTemplates.some((t) => t.id === next.defaultMinutesTemplateId)) {
    next.defaultMinutesTemplateId = "";
  }
  if (!VALID_REST_SCREEN_SECONDS.includes(next.restScreenSeconds)) {
    next.restScreenSeconds = current.restScreenSeconds;
  }
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
    ollamaNumCtx: s.ollamaNumCtx || undefined,
  };
}

export async function getWhisperModel(): Promise<string> {
  return (await readSettings()).whisperModel;
}

/** Business background always passed to the minutes LLM (empty string if unset). */
export async function getLlmBackground(): Promise<string> {
  return (await readSettings()).llmBackground?.trim() ?? "";
}

/** Global transcription glossary (empty string if unset). A series can add to it. */
export async function getSttGlossary(): Promise<string> {
  return (await readSettings()).sttGlossary?.trim() ?? "";
}

/** User-specified minutes format (empty string if unset). */
export async function getSummaryFormat(): Promise<string> {
  const s = await readSettings();
  const byId = s.minutesTemplates.find((t) => t.id === s.defaultMinutesTemplateId);
  return byId?.body.trim() ?? "";
}

/** Minutes output language (defaults to "ja" if unset). */
export async function getSummaryLanguage(): Promise<string> {
  return (await readSettings()).summaryLanguage || "ja";
}

/** Minutes verbosity level (defaults to "standard"). */
export async function getSummaryDetail(): Promise<string> {
  return (await readSettings()).summaryDetail || "standard";
}

/** Cosine threshold for voiceprint auto-naming (settings.json `voiceprintThreshold`). */
export async function getVoiceprintThreshold(): Promise<number> {
  return (await readSettings()).voiceprintThreshold;
}

/** Client-safe representation with API keys hidden. */
export type PublicSettings = Omit<
  AppSettings,
  "anthropicApiKey" | "openaiApiKey" | "sttProfiles"
> & {
  hasAnthropicApiKey: boolean;
  hasOpenaiApiKey: boolean;
  sttProfiles: PublicSttProfile[];
};

export function toPublic(s: AppSettings): PublicSettings {
  const { anthropicApiKey, openaiApiKey, sttProfiles, ...rest } = s;
  // Belt and braces for the fields profiles replaced. readSettings drops them, but this is the
  // boundary to the browser and a secret should be removed at the boundary regardless of how it
  // arrived -- a settings file read some other way, or a caller building the object by hand.
  for (const legacy of ["sttProvider", "sttRemoteBaseUrl", "sttRemoteApiKey", "sttRemoteModel", "summaryFormat"]) {
    delete (rest as Record<string, unknown>)[legacy];
  }
  return {
    ...rest,
    hasAnthropicApiKey: Boolean(anthropicApiKey),
    hasOpenaiApiKey: Boolean(openaiApiKey),
    // Every key stripped, one flag each. A profile list is no reason to loosen this.
    sttProfiles: sttProfiles.map(publicProfile),
  };
}
