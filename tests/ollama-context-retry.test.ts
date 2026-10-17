import { describe, expect, it } from "vitest";
import { contextFor, neededTokens } from "@/lib/llm/ollama";

describe("asking Ollama again with room for what it said it needed", () => {
  it("reads the token count from its refusal", () => {
    expect(
      neededTokens('{"error":"request (15606 tokens) exceeds the available context size (14336 tokens), try increasing it"}'),
    ).toBe(15606);
    expect(neededTokens('{"error":"model not found"}')).toBeNull();
  });

  it("rounds up to a step of 2048 within the budget, and gives up beyond it", () => {
    // 15606 + 1600 answer + 256 margin = 17462 → 18432.
    expect(contextFor(17462, 24576)).toBe(18432);
    // Just under the budget: the budget itself rather than a step past it.
    expect(contextFor(24000, 24576)).toBe(24576);
    expect(contextFor(30000, 24576)).toBeNull();
  });
});
