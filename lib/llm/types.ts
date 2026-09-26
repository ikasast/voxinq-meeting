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
  /**
   * Override for the Ollama context budget, in tokens.
   *
   * It rides on the config rather than being read where it is used, so the number Ollama is
   * sent as num_ctx and the number that decides whether a transcript must be condensed first
   * cannot disagree -- which is exactly what happened when it was hardcoded in both places.
   */
  ollamaNumCtx?: number;
  /**
   * Where the calls made under this config add up what they cost, when the caller wants to know.
   * On the config rather than on each call's arguments because a set of minutes can be several
   * calls — condensing a long meeting first, then writing — and every one of them is handed the
   * same config.
   */
  usage?: ChatUsage;
}

/** What a run of LLM calls cost, summed over the calls. Durations in milliseconds. */
export interface ChatUsage {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  /** Reading the prompt (Ollama `prompt_eval_duration`). */
  promptMs: number;
  /** Writing the answer (Ollama `eval_duration`) — what tokens per second is measured over. */
  generateMs: number;
  /** Loading the model before the first call could start (Ollama `load_duration`). */
  loadMs: number;
  /** The largest context window asked for, in tokens. */
  numCtx: number;
}

export function emptyUsage(): ChatUsage {
  return { calls: 0, inputTokens: 0, outputTokens: 0, promptMs: 0, generateMs: 0, loadMs: 0, numCtx: 0 };
}

/** Fold Ollama's closing line of a streamed chat into the running totals. */
export function addOllamaUsage(
  usage: ChatUsage,
  last: {
    prompt_eval_count?: number;
    eval_count?: number;
    prompt_eval_duration?: number;
    eval_duration?: number;
    load_duration?: number;
  },
): void {
  const ms = (ns?: number) => (typeof ns === "number" ? ns / 1e6 : 0);
  usage.inputTokens += last.prompt_eval_count ?? 0;
  usage.outputTokens += last.eval_count ?? 0;
  usage.promptMs += ms(last.prompt_eval_duration);
  usage.generateMs += ms(last.eval_duration);
  usage.loadMs += ms(last.load_duration);
}

export interface ChatArgs {
  system: string;
  user: string;
  maxTokens: number;
  // Pin the start of generation (prefill the assistant response opening).
  // Used to force format compliance by making small local models start from a given heading.
  // Only the supporting provider (ollama) uses it; the return value includes the prefill.
  prefill?: string;
  // Turn off a reasoning model's thinking phase (Ollama `think`). Reasoning tokens count
  // against the same budget as the answer, so on a task that wants a short structured reply
  // a model like qwen3 can spend the whole budget thinking and return nothing at all.
  // Left undefined = the model's default.
  think?: boolean;
}

export interface ChatProvider {
  readonly name: LlmProviderName;
  // `signal` lets a long generation be aborted (e.g. to free the GPU for a recording).
  chat(args: ChatArgs, cfg: LlmConfig, signal?: AbortSignal): Promise<string>;
}
