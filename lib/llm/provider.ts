// Shared plumbing for the LLM features that are not minutes generation (ask, correct).
// Extracted from ask.ts once a second caller needed the same provider lookup and budgeting.

import { anthropicProvider } from "./anthropic";
import { ollamaProvider } from "./ollama";
import { openaiProvider } from "./openai";
import type { ChatProvider, LlmProviderName } from "./types";

// Budgets and the token estimate live in context.ts, which imports nothing -- see the note
// there. Re-exported so callers can keep taking everything from one place.
export { CONTEXT_BUDGET, estTokens, ollamaContextBudget } from "./context";

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
