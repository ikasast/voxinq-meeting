// LLM provider abstraction. Entry point for minutes generation.
// Default is Ollama (on-prem). Swap to an external API with LLM_PROVIDER=anthropic|openai.

import {
  getLlmBackground,
  getLlmConfig,
  getSummaryDetail,
  getSummaryFormat,
  getSummaryLanguage,
} from "../settings";
import { buildSummarySystemPrompt, DEFAULT_SUMMARY_FORMAT } from "../minutes-prompt";
import { type SpeakerLabels, speakerName } from "../speakers";
import { anthropicProvider } from "./anthropic";
import { ollamaProvider } from "./ollama";
import { openaiProvider } from "./openai";
import type { ChatProvider, LlmConfig, LlmProviderName } from "./types";

// Usable context window (tokens) per provider, used to decide when a transcript is too
// long for a single pass and must be condensed first (map-reduce). ollama matches the
// num_ctx cap in ollama.ts; cloud models have far larger windows.
const CONTEXT_BUDGET: Record<LlmProviderName, number> = {
  ollama: 24576,
  anthropic: 180000,
  openai: 120000,
};

// Output token budget by verbosity level.
const DETAIL_MAX_TOKENS: Record<string, number> = {
  brief: 2048,
  standard: 4096,
  detailed: 8192,
};

const LANG_NAME: Record<string, string> = { ja: "日本語", en: "英語", zh: "中国語" };

// Rough token estimate. Japanese is ~1.7-2 chars/token; use 1.8 as a safe divisor.
const estTokens = (s: string) => Math.ceil(s.length / 1.8);

export type TranscriptForPrompt = {
  speakerType: string;
  text: string;
  createdAt: Date | string;
};

function providerFor(name: LlmProviderName): ChatProvider {
  switch (name) {
    case "anthropic":
      return anthropicProvider;
    case "openai":
      return openaiProvider;
    case "ollama":
    default:
      return ollamaProvider;
  }
}

// With a single speaker (not diarized), do not add a "自分:"-style prefix.
// Prefixing every line with the same speaker (with no real info) leaks into the minutes and gets verbose.
function transcriptsToText(
  transcripts: TranscriptForPrompt[],
  labels: SpeakerLabels,
  multiSpeaker: boolean,
): string {
  return transcripts
    .map((t) => (multiSpeaker ? `${speakerName(t.speakerType, labels)}: ${t.text}` : t.text))
    .join("\n");
}

// Append the shared business background (if set) as reference-only material at the END
// of the system prompt. It must NOT become minutes content: with the background at the
// top and framed as "premise", small models tend to summarize the background document
// instead of the actual transcript. Placing it last and framing it as a glossary, with a
// hard "do not include anything not in the transcript" guard, prevents that leak.
function withBackground(system: string, background: string): string {
  const bg = background.trim();
  if (!bg) return system;
  return `${system}

## 参考情報: 用語・組織・事業の背景知識（議事録の内容ではない）
以下は、発言ログに出てくる略語・固有名詞・組織名などを正しく解釈するためだけの参考資料です。
**議事録に書いてよいのは、下の発言ログで実際に話された事項だけ。** この参考情報に書かれていても、
発言ログで触れられていない事業名・組織・人物・数値・決定事項・TODO は議事録に一切含めないこと。
参考情報そのものを要約・列挙してはいけません。
"""
${bg}
"""`;
}

// For meetings in a recurring series: append the previous meeting's minutes as
// reference-only context, framed the same way as the business background so small
// models do not copy it into the new minutes. Helps the model interpret follow-up
// topics ("the issue from last time", carried-over TODOs) correctly.
const PREV_MINUTES_MAX_CHARS = 6000;
function withPreviousMinutes(
  system: string,
  prev: { title: string; date: string; text: string } | undefined,
): string {
  if (!prev?.text.trim()) return system;
  let text = prev.text.trim();
  if (text.length > PREV_MINUTES_MAX_CHARS) {
    text = `${text.slice(0, PREV_MINUTES_MAX_CHARS)}\n…（以下略）`;
  }
  return `${system}

## 参考情報: 同じシリーズの前回の議事録（今回の議事録の内容ではない）
以下は前回（${prev.date}「${prev.title}」）の議事録です。「前回の続き」「先週の件」のような発言を
正しく解釈するためだけに使ってください。**今回の議事録に書いてよいのは、今回の発言ログで実際に
話された事項だけ。** 前回の議事録にしか無い決定事項・TODO・数値を今回の議事録に書き写さないこと。
"""
${text}
"""`;
}

// Clean up LLM output. Small models sometimes wrap everything in ``` against instructions,
// or add a preamble/postamble like "以下は〜です：", so strip those.
export function sanitizeSummary(text: string): string {
  let t = text.trim();
  // Strip reasoning blocks some models emit: full <think>...</think>, or a dangling
  // opener/closer (keep the text after a lone </think>, drop everything before it).
  t = t.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  if (/<\/think>/i.test(t)) t = t.replace(/^[\s\S]*?<\/think>/i, "").trim();
  t = t.replace(/^<think>/i, "").trim();
  // If wrapped/containing ```markdown ... ```, treat the first fenced block as the body.
  const fenced = t.match(/```(?:markdown|md)?[ \t]*\r?\n([\s\S]*?)\r?\n```/i);
  if (fenced) {
    t = fenced[1].trim();
  } else {
    // Remove stray bare fence markers left at the start/end.
    t = t
      .replace(/^```(?:markdown|md)?[ \t]*\r?\n?/i, "")
      .replace(/\r?\n?```[ \t]*$/i, "")
      .trim();
  }
  return t;
}

// Condense a chunk of transcript into faithful bullet notes (the "map" step).
// Used only when the full transcript does not fit the model context.
async function condenseChunk(
  provider: ChatProvider,
  cfg: LlmConfig,
  text: string,
  language: string,
  part: number,
  total: number,
): Promise<string> {
  const lang = LANG_NAME[language] ?? "日本語";
  const system = `あなたは会議の記録補助です。以下は長い会議の発言ログの一部（パート${part}/${total}）です。あとで議事録にまとめるため、この部分に含まれる内容を${lang}で漏れなく箇条書きにしてください。決定事項・議論・課題・TODO・数値・固有名詞・担当者は落とさない。要約しすぎない。前置き・見出しは不要、箇条書きのみ。この部分に無い事項は書かない。`;
  const notes = await provider.chat(
    { system, user: text, maxTokens: 1500 },
    cfg,
  );
  return sanitizeSummary(notes);
}

// Map-reduce condensation so long meetings are never truncated: split the transcript into
// chunks that fit the context, note each, then (recursively) condense the combined notes
// until they fit. Returns text to feed the final minutes pass in place of the transcript.
// Split a transcript into line-aligned chunks that fit the per-chunk token budget.
// Pure and exported for tests: chunks must cover every line, in order, with no loss.
export function splitForCondense(conversation: string, avail: number): string[] {
  const lines = conversation.split("\n");
  const chunkBudget = Math.max(1024, avail - 1200); // leave room for the note-prompt overhead
  const chunks: string[] = [];
  let cur: string[] = [];
  let curTok = 0;
  for (const line of lines) {
    const t = estTokens(line) + 1;
    if (curTok + t > chunkBudget && cur.length) {
      chunks.push(cur.join("\n"));
      cur = [];
      curTok = 0;
    }
    cur.push(line);
    curTok += t;
  }
  if (cur.length) chunks.push(cur.join("\n"));
  return chunks;
}

async function condenseTranscript(
  provider: ChatProvider,
  cfg: LlmConfig,
  conversation: string,
  avail: number,
  language: string,
): Promise<string> {
  const chunks = splitForCondense(conversation, avail);
  const notes: string[] = [];
  for (let i = 0; i < chunks.length; i++) {
    notes.push(`# パート${i + 1}\n${await condenseChunk(provider, cfg, chunks[i], language, i + 1, chunks.length)}`);
  }
  const combined = notes.join("\n\n");
  // If even the combined notes overflow (very long meeting), condense once more.
  return estTokens(combined) > avail
    ? condenseTranscript(provider, cfg, combined, avail, language)
    : combined;
}

export async function requestSummary(
  transcripts: TranscriptForPrompt[],
  opts?: {
    description?: string | null;
    speakerLabels?: SpeakerLabels;
    // Per-generation overrides (e.g. from the "Regenerate with options" panel).
    // They apply to this run only and are NOT persisted to settings.
    detail?: string;
    provider?: string;
    // Minutes format override (e.g. the meeting's series format). Wins over the saved setting.
    format?: string;
    // Previous meeting's minutes when this meeting belongs to a series (reference-only).
    previousMinutes?: { title: string; date: string; text: string };
  },
): Promise<string> {
  const multiSpeaker = new Set(transcripts.map((t) => t.speakerType)).size > 1;
  const conversation = transcriptsToText(transcripts, opts?.speakerLabels ?? {}, multiSpeaker);

  const [cfg, background, savedFormat, language, savedDetail] = await Promise.all([
    getLlmConfig(),
    getLlmBackground(),
    getSummaryFormat(),
    getSummaryLanguage(),
    getSummaryDetail(),
  ]);
  // Format priority: per-run override (series format) > saved setting > built-in default.
  const format = opts?.format?.trim() || savedFormat;

  // Apply per-generation overrides. Detail falls back to the saved setting if invalid/absent.
  // Use hasOwnProperty (not `in`) so inherited keys like "toString"/"constructor" from a
  // crafted request body cannot select a function as maxTokens.
  const detail =
    opts?.detail && Object.prototype.hasOwnProperty.call(DETAIL_MAX_TOKENS, opts.detail)
      ? opts.detail
      : savedDetail;
  // Provider override for this run only. Each provider still uses the model configured for
  // it in settings (cfg from getLlmConfig is a fresh object, so mutating it is local).
  if (
    opts?.provider &&
    (["ollama", "anthropic", "openai"] as const).includes(opts.provider as LlmProviderName)
  ) {
    cfg.provider = opts.provider as LlmProviderName;
  }

  const provider = providerFor(cfg.provider);
  const maxTokens = DETAIL_MAX_TOKENS[detail] ?? DETAIL_MAX_TOKENS.standard;

  // Use the user-specified format if any, otherwise the default, inside the prompt.
  const effectiveFormat = format?.trim() || DEFAULT_SUMMARY_FORMAT;
  const system = withBackground(
    withPreviousMinutes(
      buildSummarySystemPrompt(opts?.description, { multiSpeaker, language, format, detail }),
      opts?.previousMinutes,
    ),
    background,
  );

  // If the transcript is too long for the model context, condense it first (map-reduce)
  // so the latter half of a long meeting is not silently dropped from the prompt.
  const budget = CONTEXT_BUDGET[cfg.provider] ?? 24576;
  const reserve = estTokens(system) + maxTokens + 1024;
  const avail = Math.max(2048, budget - reserve);
  let source = conversation;
  let condensed = false;
  if (estTokens(conversation) > avail) {
    source = await condenseTranscript(provider, cfg, conversation, avail, language);
    condensed = true;
  }

  // Use the format's first heading as a prefill so small models cannot rename headings
  // on their own (only effective on the supporting provider = ollama; others ignore it).
  const firstHeading = effectiveFormat
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.startsWith("#"));
  const prefill = firstHeading ? `${firstHeading}\n` : undefined;

  // When condensed, the source is bullet notes extracted from the whole meeting rather than
  // the raw log, but the instruction is the same: base the minutes only on this material.
  const sourceLabel = condensed
    ? "以下は、長い会議の発言ログ全体から抽出した要点メモ（会議全体をカバー）です。"
    : "以下は会議の全発言ログです。";
  const raw = await provider.chat(
    {
      system,
      user: `${sourceLabel}この内容だけを情報源として議事録を作成してください。\n\n${source}\n\n上の内容に実際に出てきた事項だけをもとに、議事録を Markdown で出力してください。ここに無い事業名・組織・人物・数値・決定事項・TODO（用語集や業務背景にしか無いもの）は書かないこと。`,
      maxTokens,
      prefill,
    },
    cfg,
  );
  return sanitizeSummary(raw);
}
