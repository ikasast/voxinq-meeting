import { describe, expect, it } from "vitest";
import { buildSummarySystemPrompt, DEFAULT_SUMMARY_FORMAT } from "../lib/minutes-prompt";

describe("buildSummarySystemPrompt", () => {
  it("uses the default format when none is given", () => {
    const p = buildSummarySystemPrompt(null, {});
    expect(p).toContain(DEFAULT_SUMMARY_FORMAT);
  });

  it("uses a custom format instead of the default", () => {
    const p = buildSummarySystemPrompt(null, { format: "## まとめ\n- 一言で" });
    expect(p).toContain("## まとめ");
    expect(p).not.toContain(DEFAULT_SUMMARY_FORMAT);
  });

  it("falls back to the default format for a whitespace-only custom format", () => {
    const p = buildSummarySystemPrompt(null, { format: "   " });
    expect(p).toContain(DEFAULT_SUMMARY_FORMAT);
  });

  it("pins the output language", () => {
    expect(buildSummarySystemPrompt(null, { language: "en" })).toContain("英語");
    expect(buildSummarySystemPrompt(null, {})).toContain("必ず日本語で");
  });

  it("includes the meeting description when provided", () => {
    const p = buildSummarySystemPrompt("四半期レビュー");
    expect(p).toContain("四半期レビュー");
  });

  it("forbids speaker prefixes for single-speaker logs", () => {
    const p = buildSummarySystemPrompt(null, { multiSpeaker: false });
    expect(p).toContain("話者名は一切書かない");
  });

  it("adds detail guidance only for non-standard levels", () => {
    expect(buildSummarySystemPrompt(null, { detail: "detailed" })).toContain("## 詳しさ");
    expect(buildSummarySystemPrompt(null, { detail: "standard" })).not.toContain("## 詳しさ");
  });
});
