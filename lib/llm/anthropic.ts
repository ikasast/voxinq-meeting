import Anthropic from "@anthropic-ai/sdk";
import type { ChatArgs, ChatProvider, LlmConfig } from "./types";

// Provider for using the paid Anthropic API.
// Adds prompt caching (ephemeral) to system to cut the cost of repeated calls during a meeting.
// The API key comes from runtime config (LlmConfig); the client is cached per key.

let _client: Anthropic | null = null;
let _clientKey: string | null = null;

function client(apiKey: string | undefined): Anthropic {
  if (!apiKey) throw new Error("Anthropic API キーが設定されていません");
  if (!_client || _clientKey !== apiKey) {
    _client = new Anthropic({ apiKey });
    _clientKey = apiKey;
  }
  return _client;
}

export const anthropicProvider: ChatProvider = {
  name: "anthropic",
  async chat({ system, user, maxTokens }: ChatArgs, cfg: LlmConfig): Promise<string> {
    const res = await client(cfg.anthropicApiKey).messages.create({
      model: cfg.anthropicModel,
      max_tokens: maxTokens,
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: user }],
    });
    return res.content
      .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
  },
};
