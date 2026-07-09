// Common interface for LLM providers.
// Takes the two messages (system / user) plus runtime config (LlmConfig) and returns generated text.
// Provider-specific optimizations (e.g. Anthropic prompt caching) are done in each implementation.

export type LlmProviderName = "ollama" | "anthropic" | "openai";

export interface LlmConfig {
  provider: LlmProviderName;
  ollamaBaseUrl: string;
  ollamaModel: string;
  anthropicApiKey?: string;
  anthropicModel: string;
  openaiApiKey?: string;
  openaiBaseUrl: string;
  openaiModel: string;
}

export interface ChatArgs {
  system: string;
  user: string;
  maxTokens: number;
  // Pin the start of generation (prefill the assistant response opening).
  // Used to force format compliance by making small local models start from a given heading.
  // Only the supporting provider (ollama) uses it; the return value includes the prefill.
  prefill?: string;
}

export interface ChatProvider {
  readonly name: LlmProviderName;
  chat(args: ChatArgs, cfg: LlmConfig): Promise<string>;
}
