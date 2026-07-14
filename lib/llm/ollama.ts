import type { ChatArgs, ChatProvider, LlmConfig } from "./types";

// Default on-prem provider. Calls a local Ollama.
// Defaults to a Japanese model that fits in 8GB VRAM (qwen2.5:7b-instruct ≈4.7GB).
export const ollamaProvider: ChatProvider = {
  name: "ollama",
  async chat({ system, user, maxTokens, prefill }: ChatArgs, cfg: LlmConfig): Promise<string> {
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
    // Clamp to sane steps. 32k is qwen2.5's max; cap at 24k to stay within 8GB VRAM.
    const numCtx = Math.min(24576, Math.max(8192, Math.ceil(estTokens / 2048) * 2048));

    // Stream the response. Without streaming, Ollama sends no HTTP headers until the
    // FULL generation is done — and Node's fetch (undici) aborts requests whose headers
    // take more than 5 minutes (UND_ERR_HEADERS_TIMEOUT). Long meetings / "detailed"
    // runs regularly exceed that, so non-streaming caused hard generation failures.
    const res = await fetch(`${cfg.ollamaBaseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: cfg.ollamaModel,
        stream: true,
        messages,
        // Minutes are a structured-extraction task, so keep it stable at low temperature.
        // At the default (0.8), a 7B model on thin input tends to produce token garbage
        // like "特 Nvidia" or to copy the instructions verbatim.
        options: {
          num_ctx: numCtx,
          num_predict: maxTokens,
          temperature: 0.3,
          top_p: 0.9,
          repeat_penalty: 1.1,
        },
      }),
    });
    if (!res.ok || !res.body) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Ollama 呼び出しに失敗 (${res.status}): ${detail.slice(0, 300)}`);
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
          const chunk = JSON.parse(line) as { message?: { content?: string }; error?: string };
          if (chunk.error) throw new Error(`Ollama エラー: ${chunk.error.slice(0, 300)}`);
          content += chunk.message?.content ?? "";
        } catch (e) {
          if (e instanceof Error && e.message.startsWith("Ollama エラー")) throw e;
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
