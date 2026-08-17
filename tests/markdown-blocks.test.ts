import { describe, expect, it } from "vitest";
import { blockText, parseInline, parseMarkdownBlocks } from "../lib/markdown-blocks";

describe("parseInline", () => {
  it("reads bold, italic and code", () => {
    expect(parseInline("a **b** c")).toEqual([
      { text: "a " },
      { text: "b", bold: true },
      { text: " c" },
    ]);
    expect(parseInline("_em_")).toEqual([{ text: "em", italic: true }]);
    expect(parseInline("use `npm test`")).toEqual([
      { text: "use " },
      { text: "npm test", code: true },
    ]);
  });

  it("prefers bold over italic for a double marker", () => {
    expect(parseInline("**both**")).toEqual([{ text: "both", bold: true }]);
  });

  it("leaves an unclosed marker as text", () => {
    // A lone asterisk in a sentence is punctuation, not the start of emphasis.
    expect(parseInline("2 * 3 = 6")).toEqual([{ text: "2 * 3 = 6" }]);
    expect(parseInline("**oops")).toEqual([{ text: "**oops" }]);
  });

  it("returns one empty span for an empty line", () => {
    expect(parseInline("")).toEqual([{ text: "" }]);
  });

  it("handles Japanese text around markers", () => {
    expect(parseInline("**決定事項**: 来週まで")).toEqual([
      { text: "決定事項", bold: true },
      { text: ": 来週まで" },
    ]);
  });
});

describe("parseMarkdownBlocks", () => {
  it("reads the shape minutes actually take", () => {
    const blocks = parseMarkdownBlocks(
      ["# 会議名", "", "## 決定事項", "", "- 予算を承認", "- 締切は9月末", "", "本文の段落。"].join(
        "\n",
      ),
    );
    expect(blocks.map((b) => b.kind)).toEqual([
      "heading",
      "heading",
      "bullet",
      "bullet",
      "paragraph",
    ]);
    expect(blocks[0]).toMatchObject({ level: 1 });
    expect(blocks[1]).toMatchObject({ level: 2 });
    expect(blockText(blocks[2])).toBe("予算を承認");
  });

  it("joins wrapped lines into one paragraph", () => {
    const blocks = parseMarkdownBlocks("one line\nand its continuation\n\nsecond");
    expect(blocks).toHaveLength(2);
    expect(blockText(blocks[0])).toBe("one line and its continuation");
  });

  it("tracks list nesting by indentation", () => {
    const blocks = parseMarkdownBlocks("- top\n  - nested\n    - deeper");
    expect(blocks.map((b) => ("depth" in b ? b.depth : null))).toEqual([0, 1, 2]);
  });

  it("reads numbered lists in both punctuations", () => {
    const blocks = parseMarkdownBlocks("1. first\n2) second");
    expect(blocks.map((b) => b.kind)).toEqual(["numbered", "numbered"]);
  });

  it("keeps fenced code literal, headings included", () => {
    const blocks = parseMarkdownBlocks("```\n# not a heading\n```");
    expect(blocks).toHaveLength(1);
    expect(blocks[0].kind).toBe("paragraph");
    expect(blockText(blocks[0])).toBe("# not a heading");
  });

  it("reads quotes and rules", () => {
    const blocks = parseMarkdownBlocks("> quoted\n\n---");
    expect(blocks.map((b) => b.kind)).toEqual(["quote", "rule"]);
    expect(blockText(blocks[0])).toBe("quoted");
  });

  it("does not mistake a hyphen inside text for a bullet", () => {
    const blocks = parseMarkdownBlocks("A-B is the code");
    expect(blocks[0].kind).toBe("paragraph");
  });

  it("survives an empty document", () => {
    expect(parseMarkdownBlocks("")).toEqual([]);
    expect(parseMarkdownBlocks("\n\n  \n")).toEqual([]);
  });
});
