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
    const res = await fetch(`${cfg.openaiBaseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: cfg.openaiModel,
        max_tokens: maxTokens,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`OpenAI 呼び出しに失敗 (${res.status}): ${detail.slice(0, 300)}`);
    }
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    return (data.choices?.[0]?.message?.content ?? "").trim();
  },
};
