import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CONTEXT_BUDGET, estTokens, ollamaContextBudget } from "../lib/llm/context";
import { CONTEXT_BUDGET as VIA_PROVIDER } from "../lib/llm/provider";

// The Ollama budget is two things at once, and they have to be the same number: what Ollama is
// told to hold (num_ctx), and the size a transcript is condensed down to before being sent. It
// was written out three times, so raising one left the others behind — condensing for one
// size, then asking the model to hold another.

describe("there is one Ollama budget, not three", () => {
  it("provider re-exports the same object it used to duplicate", () => {
    expect(VIA_PROVIDER).toBe(CONTEXT_BUDGET);
  });

  it("no module writes the number out again", () => {
    // The literal belongs in context.ts and nowhere else. A second copy compiles, passes every
    // other test, and quietly disagrees the first time someone changes one of them.
    const root = join(__dirname, "..", "lib", "llm");
    for (const file of ["index.ts", "provider.ts", "ollama.ts", "ask.ts", "correct.ts"]) {
      const source = readFileSync(join(root, file), "utf-8");
      expect(source, `${file} hardcodes the budget`).not.toMatch(/\b24576\b/);
    }
  });
});

describe("the override is a setting, and a guarded one", () => {
  it("uses the built-in budget when unset", () => {
    expect(ollamaContextBudget(undefined)).toBe(CONTEXT_BUDGET.ollama);
    expect(ollamaContextBudget(0)).toBe(CONTEXT_BUDGET.ollama);
  });

  it("takes a larger window from someone with a bigger card", () => {
    expect(ollamaContextBudget(65536)).toBe(65536);
  });

  it("refuses a window too small to hold the instructions", () => {
    // Below this there is no room for a prompt, let alone a meeting. A number that small is a
    // mistake, and honouring it would produce truncated nonsense rather than an error.
    expect(ollamaContextBudget(512)).toBe(CONTEXT_BUDGET.ollama);
  });
});

describe("cloud budgets stay far larger", () => {
  it("does not condense for models that do not need it", () => {
    // A regression here would silently map-reduce every long meeting sent to a cloud model,
    // costing quality for no reason.
    expect(CONTEXT_BUDGET.anthropic).toBeGreaterThan(CONTEXT_BUDGET.ollama * 4);
    expect(CONTEXT_BUDGET.openai).toBeGreaterThan(CONTEXT_BUDGET.ollama * 4);
  });
});

describe("estTokens", () => {
  it("reads Japanese at roughly 1.8 characters per token", () => {
    expect(estTokens("あ".repeat(1800))).toBe(1000);
  });

  it("rounds up, so a budget is never quietly exceeded", () => {
    expect(estTokens("a")).toBe(1);
  });
});
