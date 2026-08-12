// Glossary-driven transcript corrections.
//
// Whisper mishears proper nouns it has never seen — project names, product names, people.
// The glossary biases recognition at transcribe time, but that only helps models that accept
// an initial_prompt: kotoba-whisper ignores it entirely (see docs/design-decisions.md), and
// even large-v3-turbo misses terms the prompt did not fit.
//
// So this is the second chance: after the meeting, ask the LLM to find *only* places where a
// glossary term was misrecognized, and propose before/after pairs. The model never edits
// anything — the user applies each suggestion, or does not. Everything the model returns is
// checked against the actual transcript below before it is offered, because a 7B model asked
// for JSON will occasionally invent a line, rewrite a sentence it was not asked to touch, or
// return prose.

import { getLlmConfig } from "../settings";
import { CONTEXT_BUDGET, estTokens, providerFor } from "./provider";

const SUGGEST_MAX_TOKENS = 1024;

/** How far the corrected text may drift in length. A rewrite is not a term fix. */
const LEN_RATIO_MIN = 0.5;
const LEN_RATIO_MAX = 2.0;

export type UtteranceForCorrection = { id: string; text: string };
export type Suggestion = { transcriptId: string; before: string; after: string };

/**
 * Split the glossary into terms. Users write it as a comma-, newline- or 、-separated list
 * (the field is free text and the placeholder shows commas), so accept all three.
 */
export function parseGlossaryTerms(glossary: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of glossary.split(/[,、\r\n]+/)) {
    const t = raw.trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

export function buildCorrectionSystemPrompt(terms: string[]): string {
  return [
    "あなたは音声認識（ASR）結果の校正者です。会議の書き起こしから、**用語集に載っている語の誤認識だけ**を見つけ出します。",
    "",
    "## 用語集",
    terms.map((t) => `- ${t}`).join("\n"),
    "",
    "## 手順",
    "**上の用語集の語を一つずつ**声に出して読み、その読みに近い音の箇所が発言中にないか探してください。",
    "音声認識は知らない固有名詞をカタカナで書き起こします。用語集の語がカタカナ",
    "（またはひらがな・当て字）になっている箇所が主な検出対象です。",
    "",
    "形式の例（※ここに出てくる語は説明用です。実際に探すのは**上の用語集の語だけ**）:",
    "用語集に「Kubernetes」がある場合、発言「クーバネティスの設定を見直します」の",
    "「クーバネティス」は「Kubernetes」の誤認識なので、",
    '{"i": その番号, "before": "クーバネティスの設定を見直します", "after": "Kubernetesの設定を見直します"} と出力します。',
    "用語集の語が既に正しい表記で書かれている箇所は、修正対象ではありません。",
    "",
    "## 禁止事項（重要）",
    "- 言い換え・要約・文法の修正・句読点の追加をしない。用語の置き換え以外は一切変更しない。",
    "- 用語集に無い語を修正しない。",
    "- 確信が持てない箇所は出力しない。**見逃しより誤検出の方が有害です。**",
    "- 発言を新しく作らない。与えられた発言だけを対象にする。",
    "",
    "## 出力形式",
    "JSON配列のみを出力してください。前置き・説明・コードフェンスは書かないこと。",
    '各要素は {"i": 発言番号, "before": "修正前の発言全文", "after": "修正後の発言全文"} です。',
    "`before` は与えられた発言と**一字一句同じ**でなければなりません。",
    "`after` は用語を置き換えただけの、それ以外は同一の文にしてください。",
    "該当が一つも無ければ `[]` とだけ出力してください。",
    "",
    // Repeated last: with the term list far above the instructions, a 7B model drifts toward
    // the illustrative example instead of the real glossary.
    `**探す対象はこの${terms.length}語だけです: ${terms.join(" / ")}**`,
  ].join("\n");
}

export function buildCorrectionUserPrompt(utterances: UtteranceForCorrection[]): string {
  const lines = utterances.map((u, i) => `${i}: ${u.text}`).join("\n");
  return `## 発言\n${lines}\n\n上の発言から、用語集の語の誤認識だけを JSON 配列で出力してください。`;
}

/** Strip a ```json fence if the model wrapped its answer despite being told not to. */
function stripFence(s: string): string {
  const m = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  return (m ? m[1] : s).trim();
}

/**
 * Keep only suggestions that are safe to offer. Everything here is a failure mode actually
 * seen from small models asked for structured output — the transcript is the source of truth,
 * not the model's claim about it.
 */
export function validateSuggestions(
  raw: string,
  utterances: UtteranceForCorrection[],
  terms: string[],
): Suggestion[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripFence(raw));
  } catch {
    return []; // not JSON at all -> the model answered in prose; nothing salvageable
  }
  if (!Array.isArray(parsed)) return [];

  const lowerTerms = terms.map((t) => t.toLowerCase());
  const out: Suggestion[] = [];
  const usedIndexes = new Set<number>();

  for (const item of parsed) {
    if (!item || typeof item !== "object") continue;
    const { i, before, after } = item as { i?: unknown; before?: unknown; after?: unknown };
    if (typeof i !== "number" || !Number.isInteger(i)) continue;
    if (i < 0 || i >= utterances.length) continue; // hallucinated line number
    if (usedIndexes.has(i)) continue; // one suggestion per utterance
    if (typeof before !== "string" || typeof after !== "string") continue;

    const target = utterances[i];
    // The model must be quoting the real utterance. If it is not, it is working from something
    // it invented, and `after` cannot be trusted to be that utterance with a term swapped.
    if (before !== target.text) continue;

    const trimmed = after.trim();
    if (!trimmed || trimmed === target.text) continue;

    // A term fix keeps the sentence roughly the same length; a rewrite does not.
    const ratio = trimmed.length / (target.text.length || 1);
    if (ratio < LEN_RATIO_MIN || ratio > LEN_RATIO_MAX) continue;

    // The whole point is inserting a glossary term. If none appears, this is some other edit.
    const lower = trimmed.toLowerCase();
    if (!lowerTerms.some((t) => lower.includes(t))) continue;

    usedIndexes.add(i);
    out.push({ transcriptId: target.id, before: target.text, after: trimmed });
  }
  return out;
}

/**
 * Split utterances into passes that fit the model's context, keeping the prompt overhead in
 * mind. Long meetings otherwise silently lose their tail.
 */
export function chunkUtterances(
  utterances: UtteranceForCorrection[],
  budgetTokens: number,
): UtteranceForCorrection[][] {
  const chunks: UtteranceForCorrection[][] = [];
  let current: UtteranceForCorrection[] = [];
  let tokens = 0;
  for (const u of utterances) {
    const cost = estTokens(u.text) + 8; // + the "N: " prefix and newline
    if (current.length > 0 && tokens + cost > budgetTokens) {
      chunks.push(current);
      current = [];
      tokens = 0;
    }
    current.push(u);
    tokens += cost;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

export type CorrectionResult = { suggestions: Suggestion[]; checked: number };

/** Propose glossary-term fixes across a meeting's transcript. Suggests only; never writes. */
export async function suggestCorrections(
  utterances: UtteranceForCorrection[],
  glossary: string,
  signal?: AbortSignal,
): Promise<CorrectionResult> {
  const terms = parseGlossaryTerms(glossary);
  if (terms.length === 0 || utterances.length === 0) {
    return { suggestions: [], checked: 0 };
  }

  const cfg = await getLlmConfig();
  const provider = providerFor(cfg.provider);
  const system = buildCorrectionSystemPrompt(terms);
  // Leave room for the instructions and the answer itself.
  const budget = Math.max(
    500,
    CONTEXT_BUDGET[cfg.provider] - SUGGEST_MAX_TOKENS - estTokens(system) - 500,
  );

  const suggestions: Suggestion[] = [];
  let checked = 0;
  for (const chunk of chunkUtterances(utterances, budget)) {
    signal?.throwIfAborted();
    const answer = await provider.chat(
      {
        system,
        user: buildCorrectionUserPrompt(chunk),
        maxTokens: SUGGEST_MAX_TOKENS,
        // Wanted: a short JSON array. qwen3:8b otherwise spends the whole budget reasoning
        // and returns empty content.
        think: false,
      },
      cfg,
      signal,
    );
    suggestions.push(...validateSuggestions(answer, chunk, terms));
    checked += chunk.length;
  }
  return { suggestions, checked };
}
