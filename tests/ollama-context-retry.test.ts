import { describe, expect, it } from "vitest";
import { charsPerToken, contextFor, contextStep, learnCharsPerToken, neededTokens } from "@/lib/llm/ollama";

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

describe("asking for the right window the first time", () => {
  it("asks for a few coarse sizes, so the model is not loaded again for each call", () => {
    expect(contextStep(3000, 24576)).toBe(8192);
    expect(contextStep(9000, 24576)).toBe(16384);
    expect(contextStep(21900, 24576)).toBe(24576);
    // Never past the budget: the caller condensed to fit it.
    expect(contextStep(40000, 24576)).toBe(24576);
  });

  it("learns a model's characters per token from a refusal, and only ever lowers it", () => {
    const model = "test-model";
    expect(charsPerToken(model)).toBe(1.5);
    // Nemotron Nano 9B v2 Japanese: 19314 tokens for 28600 characters.
    learnCharsPerToken(model, 28600, 19314);
    expect(charsPerToken(model)).toBeCloseTo((28600 / 19314) * 0.95, 5);
    learnCharsPerToken(model, 30000, 10000);
    expect(charsPerToken(model)).toBeCloseTo((28600 / 19314) * 0.95, 5);
    expect(charsPerToken("another-model")).toBe(1.5);
  });
});
