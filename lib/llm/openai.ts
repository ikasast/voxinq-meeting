import type { ChatArgs, ChatProvider, LlmConfig } from "./types";

// Provider for using an OpenAI-compatible API. Works with OpenAI itself and with local
// servers that expose the same API (vLLM, LM Studio, llama.cpp server, etc.).
// Uses fetch only (no SDK). Point openaiBaseUrl at the target server.
// The API key is optional: local servers (LM Studio / vLLM) usually need none, so send the
// Authorization header only when a key is set.
export const openaiProvider: ChatProvider = {
  name: "openai",
  async chat({ system, user, maxTokens }: ChatArgs, cfg: LlmConfig): Promise<string> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (cfg.openaiApiKey) headers.Authorization = `Bearer ${cfg.openaiApiKey}`;
    // Stream (SSE): slow local servers may take >5 min to produce a full answer, and
    // Node's fetch aborts requests whose response headers take that long
    // (UND_ERR_HEADERS_TIMEOUT). Streaming sends headers immediately.
    const res = await fetch(`${cfg.openaiBaseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: cfg.openaiModel,
        max_tokens: maxTokens,
        stream: true,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (!res.ok || !res.body) {
      const detail = await res.text().catch(() => "");
      throw new Error(`OpenAI 呼び出しに失敗 (${res.status}): ${detail.slice(0, 300)}`);
    }

    // SSE stream: lines like `data: {"choices":[{"delta":{"content":"…"}}]}`, ending with `data: [DONE]`.
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
      for (const raw of lines) {
        const line = raw.trim();
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (payload === "[DONE]") continue;
        try {
          const chunk = JSON.parse(payload) as {
            choices?: { delta?: { content?: string } }[];
            error?: { message?: string };
          };
          if (chunk.error?.message) {
            throw new Error(`OpenAI エラー: ${chunk.error.message.slice(0, 300)}`);
          }
          content += chunk.choices?.[0]?.delta?.content ?? "";
        } catch (e) {
          if (e instanceof Error && e.message.startsWith("OpenAI エラー")) throw e;
          // ignore malformed keep-alive lines
        }
      }
    }
    return content.trim();
  },
};
