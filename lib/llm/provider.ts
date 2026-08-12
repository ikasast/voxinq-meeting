// Shared plumbing for the LLM features that are not minutes generation (ask, correct).
// Extracted from ask.ts once a second caller needed the same provider lookup and budgeting.

import { anthropicProvider } from "./anthropic";
import { ollamaProvider } from "./ollama";
import { openaiProvider } from "./openai";
import type { ChatProvider, LlmProviderName } from "./types";

// Same budgets as minutes generation: what one pass can hold per provider.
export const CONTEXT_BUDGET: Record<LlmProviderName, number> = {
  ollama: 24576,
  anthropic: 180000,
  openai: 120000,
};

// Japanese is ~1.7-2 chars/token; 1.8 is a safe divisor.
export const estTokens = (s: string) => Math.ceil(s.length / 1.8);

export function providerFor(name: LlmProviderName): ChatProvider {
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
