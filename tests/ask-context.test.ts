import { describe, expect, it } from "vitest";
import { buildAskContext } from "../lib/llm/ask";

const meeting = (title: string, minutes: string | null, day: string) => ({
  title,
  startedAt: new Date(`2026-08-${day}T09:00:00Z`),
  minutes,
});

describe("buildAskContext", () => {
  it("skips meetings that have no minutes", () => {
    const r = buildAskContext([meeting("A", null, "10"), meeting("B", "## 概要\n決定した", "09")], 10000);
    expect(r.used).toBe(1);
    expect(r.context).toContain("B");
    expect(r.context).not.toContain("A");
  });

  it("labels each meeting with its date and title", () => {
    const r = buildAskContext([meeting("週次定例", "## 概要\nTODO: 資料作成", "11")], 10000);
    expect(r.context).toContain("### 2026-08-11 週次定例");
    expect(r.context).toContain("TODO: 資料作成");
  });

  it("drops the oldest meetings when they do not all fit, and reports how many", () => {
    const long = "あ".repeat(2000);
    const r = buildAskContext(
      [meeting("newest", long, "12"), meeting("mid", long, "11"), meeting("oldest", long, "10")],
      1200,
    );
    expect(r.used).toBe(1);
    expect(r.omitted).toBe(2);
    expect(r.context).toContain("newest");
    expect(r.context).not.toContain("oldest");
  });

  it("keeps the newest meeting even when it alone exceeds the budget", () => {
    const r = buildAskContext([meeting("newest", "あ".repeat(5000), "12")], 100);
    expect(r.used).toBe(1);
    expect(r.context).toContain("newest");
  });
});
