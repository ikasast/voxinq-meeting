import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_SUMMARY_FORMAT } from "@/lib/minutes-prompt";
import { plainLead } from "@/lib/minutes-lead";

// The minutes' headings: "#" for the big parts, "##" for a topic, "###" inside one — each level
// set apart on screen by its own rule, so an h1 is no longer a twin of an h2.

describe("the built-in format", () => {
  it("uses # for its parts and ## for each topic", () => {
    expect(DEFAULT_SUMMARY_FORMAT.startsWith("# 会議概要")).toBe(true);
    expect(DEFAULT_SUMMARY_FORMAT).toContain("\n# 会議の詳細");
    expect(DEFAULT_SUMMARY_FORMAT).toContain("\n# 次回へのTODO");
    expect(DEFAULT_SUMMARY_FORMAT).toContain("「## 議題名」");
  });
});

describe("the heading styles", () => {
  const css = readFileSync(join(__dirname, "..", "app/globals.css"), "utf8");
  it("give h1 a heavy rule and h2 a hairline", () => {
    expect(css).toMatch(/\.minutes-prose h1 \{[^}]*border-bottom: 2px solid/);
    expect(css).toMatch(/\.minutes-prose h2 \{[^}]*border-bottom: 1px solid/);
  });
});

describe("a series row's opening line", () => {
  it("is the first part, whether the minutes use # or ##", () => {
    expect(plainLead("# 会議概要\n- 決定A\n# 会議の詳細\n## 議題\n- 詳細")).toBe("決定A");
    expect(plainLead("## 会議概要\n- 決定B\n## 次回へのTODO\n- x")).toBe("決定B");
  });
});
