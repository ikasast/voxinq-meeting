import { ollamaContextBudget } from "./context";
import { addOllamaUsage, type ChatArgs, type ChatProvider, type LlmConfig } from "./types";

// Default on-prem provider. Calls a local Ollama. Which model is a setting; what it costs to
// hold is worked out from the model itself (lib/llm/ollama-models.ts).
export const ollamaProvider: ChatProvider = {
  name: "ollama",
  async chat(
    { system, user, maxTokens, prefill, think }: ChatArgs,
    cfg: LlmConfig,
    signal?: AbortSignal,
  ): Promise<string> {
    // If prefill is given, provide it as the opening of the assistant turn and let it continue.
    // 7B-class local models tend to change heading names on their own, so pin the
    // first heading to force format compliance.
    const messages: { role: string; content: string }[] = [
      { role: "system", content: system },
      { role: "user", content: user },
    ];
    if (prefill) messages.push({ role: "assistant", content: prefill });

    // Ollama's default context window (num_ctx) is only ~2048 tokens. With a long
    // business-background reference and a full meeting transcript, the transcript (at the
    // end of the user message) gets truncated out of context, so the model summarizes the
    // system prompt (background + format example) instead of the actual meeting.
    // Size num_ctx from the actual input so the whole transcript fits.
    // Japanese is roughly ~1.8 chars/token; add the output budget and a margin.
    const promptChars = system.length + user.length + (prefill?.length ?? 0);
    const estTokens = Math.ceil(promptChars / 1.8) + maxTokens + 512;
    // Clamp to sane steps, and cap at the same budget the caller used to decide whether this
    // transcript needed condensing first. Two numbers here means condensing for one size and
    // then asking the model to hold another.
    const ceiling = ollamaContextBudget(cfg.ollamaNumCtx);
    let numCtx = Math.min(ceiling, Math.max(8192, Math.ceil(estTokens / 2048) * 2048));

    // Stream the response. Without streaming, Ollama sends no HTTP headers until the
    // FULL generation is done — and Node's fetch (undici) aborts requests whose headers
    // take more than 5 minutes (UND_ERR_HEADERS_TIMEOUT). Long meetings / "detailed"
    // runs regularly exceed that, so non-streaming caused hard generation failures.
    const post = (ctx: number) =>
      fetch(`${cfg.ollamaBaseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal,
        body: JSON.stringify({
          model: cfg.ollamaModel,
          stream: true,
          messages,
          // Reasoning tokens are drawn from the same num_predict budget as the answer, so a
          // thinking model can exhaust it before emitting anything. Callers that want a short
          // structured reply pass think:false; omitted leaves the model's default alone.
          ...(think === undefined ? {} : { think }),
          // Minutes are a structured-extraction task, so keep it stable at low temperature.
          // At the default (0.8), a 7B model on thin input tends to produce token garbage
          // like "特 Nvidia" or to copy the instructions verbatim.
          options: {
            num_ctx: ctx,
            num_predict: maxTokens,
            temperature: 0.3,
            top_p: 0.9,
            repeat_penalty: 1.1,
          },
        }),
      });
    let res = await post(numCtx);
    // The estimate above is characters over 1.8, and some prompts take more tokens than that:
    // numbered lines with times and speaker names came out near 1.4 (a meeting's feedback asked
    // for 15606 tokens of a 14336 window). Ollama says how many it needed, so ask once more with
    // room for exactly that, while it is within the budget.
    if (res.status === 400) {
      const detail = await res.text().catch(() => "");
      const needed = neededTokens(detail);
      const retry = needed === null ? null : contextFor(needed + maxTokens + 256, ceiling);
      if (retry === null || retry <= numCtx) {
        throw new Error(`Ollama call failed (HTTP ${res.status}): ${detail.slice(0, 300)}`);
      }
      numCtx = retry;
      res = await post(numCtx);
    }
    if (cfg.usage) {
      cfg.usage.calls += 1;
      cfg.usage.numCtx = Math.max(cfg.usage.numCtx, numCtx);
    }
    if (!res.ok || !res.body) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Ollama call failed (HTTP ${res.status}): ${detail.slice(0, 300)}`);
    }

    // NDJSON stream: one {"message":{"content":"…"},"done":false} object per line.
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let content = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? ""; // keep a possibly incomplete trailing line
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const chunk = JSON.parse(line) as {
            message?: { content?: string };
            error?: string;
            done?: boolean;
          } & Parameters<typeof addOllamaUsage>[1];
          if (chunk.error) throw new Error(`Ollama error: ${chunk.error.slice(0, 300)}`);
          content += chunk.message?.content ?? "";
          // The last line carries what the call cost: tokens in and out, and the time spent on each.
          if (chunk.done && cfg.usage) addOllamaUsage(cfg.usage, chunk);
        } catch (e) {
          // An error the server sends mid-stream is the answer; only unreadable lines are skipped.
          if (e instanceof Error && e.message.startsWith("Ollama error")) throw e;
          // ignore malformed keep-alive lines
        }
      }
    }
    content = content.trim();
    // The prefill is not part of the model's response (only the continuation returns), so re-attach it.
    // But avoid double output when the model repeats the prefill.
    if (prefill && !content.startsWith(prefill.trim())) {
      return `${prefill}${content}`;
    }
    return content;
  },
};

// Immediately free the model's VRAM so the GPU can be handed to Whisper for a recording.
// `keep_alive: 0` tells Ollama to unload the model right after this (prompt-less) request.
// Best-effort: if Ollama is down or the model isn't loaded, there's nothing to do.
export async function unloadOllama(cfg: LlmConfig): Promise<void> {
  try {
    await fetch(`${cfg.ollamaBaseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: cfg.ollamaModel, keep_alive: 0 }),
    });
  } catch {
    // ignore
  }
}

/** The tokens a request needed, from Ollama's "request (N tokens) exceeds the available context size". */
export function neededTokens(detail: string): number | null {
  const m = /request \((\d+) tokens\) exceeds the available context size/.exec(detail);
  return m ? Number(m[1]) : null;
}

/** A context window that holds `tokens`, in steps of 2048, or null if the budget cannot. */
export function contextFor(tokens: number, ceiling: number): number | null {
  const ctx = Math.ceil(tokens / 2048) * 2048;
  if (ctx <= ceiling) return ctx;
  return tokens <= ceiling ? ceiling : null;
}

