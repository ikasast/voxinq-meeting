// How much a single pass can hold, per provider.
//
// Its own module, importing nothing, because both the provider implementations and the code
// that decides whether to condense a transcript need these numbers -- and putting them beside
// `providerFor` made ollama.ts import provider.ts while provider.ts imported ollama.ts. That
// cycle happens to work today only because nothing reads across it at module load.

import type { LlmProviderName } from "./types";

/**
 * Usable context window in tokens: what one pass can hold before a transcript has to be
 * condensed first (map-reduce).
 *
 * Defined once. It used to be declared identically in two files and hardcoded a third time as
 * the `num_ctx` Ollama is actually sent, so raising one silently left the others disagreeing --
 * and the threshold for condensing no longer matched what the model could hold.
 *
 * The Ollama figure is a **VRAM** budget, not a model limit: qwen2.5 accepts 32k, but asking
 * for more than the card can hold makes Ollama spill to the CPU, where generation goes from
 * minutes to tens of minutes. 24576 is what fits beside a 7B model on 8 GB.
 */
export const CONTEXT_BUDGET: Record<LlmProviderName, number> = {
  ollama: 24576,
  anthropic: 180000,
  openai: 120000,
};

/**
 * The Ollama budget in force, honouring `ollamaNumCtx` from settings when it is set.
 *
 * A setting rather than detection. There is no reliable way to read the *usable* VRAM across
 * NVIDIA, AMD, Apple silicon and CPU-only hosts, and being wrong is silent and slow — a model
 * that spilled to the CPU still answers, just many times later. Someone with a bigger card
 * knows what they have.
 */
export function ollamaContextBudget(override?: number): number {
  return typeof override === "number" && override >= 2048 ? override : CONTEXT_BUDGET.ollama;
}

/** Japanese is ~1.7-2 chars/token; 1.8 is a safe divisor. */
export const estTokens = (s: string) => Math.ceil(s.length / 1.8);
