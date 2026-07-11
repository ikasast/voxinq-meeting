import { describe, expect, it } from "vitest";
import { sanitizeSummary, splitForCondense } from "../lib/llm";

describe("splitForCondense", () => {
  const line = (i: number) => `Speaker ${i % 3}: utterance number ${i} with some padding text`;

  it("returns a single chunk when the transcript fits", () => {
    const conversation = [line(1), line(2), line(3)].join("\n");
    expect(splitForCondense(conversation, 8192)).toEqual([conversation]);
  });

  it("preserves every line, in order, across chunks (no data loss)", () => {
    const lines = Array.from({ length: 2000 }, (_, i) => line(i));
    const chunks = splitForCondense(lines.join("\n"), 3000);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join("\n").split("\n")).toEqual(lines);
  });

  it("keeps chunks within the budget (except unsplittable single lines)", () => {
    const lines = Array.from({ length: 500 }, (_, i) => line(i));
    const avail = 3000;
    const chunks = splitForCondense(lines.join("\n"), avail);
    const budget = avail - 1200;
    for (const c of chunks) {
      // estTokens = ceil(len/1.8); each chunk stays under budget plus one line of slack
      expect(Math.ceil(c.length / 1.8)).toBeLessThanOrEqual(budget + line(0).length);
    }
  });
});

describe("sanitizeSummary", () => {
  it("strips a full <think> block", () => {
    expect(sanitizeSummary("<think>reasoning here</think>\n## 会議概要\n- done")).toBe(
      "## 会議概要\n- done",
    );
  });

  it("keeps only the text after a dangling </think>", () => {
    expect(sanitizeSummary("leaked reasoning</think>## 会議概要")).toBe("## 会議概要");
  });

  it("unwraps a fenced markdown body", () => {
    expect(sanitizeSummary("```markdown\n## 会議概要\n- a\n```")).toBe("## 会議概要\n- a");
  });

  it("removes stray fences at the edges", () => {
    expect(sanitizeSummary("```\n## 会議概要")).toBe("## 会議概要");
  });

  it("leaves clean output untouched", () => {
    const clean = "## 会議概要\n- decided X";
    expect(sanitizeSummary(clean)).toBe(clean);
  });
});
