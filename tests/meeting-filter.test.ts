import { describe, expect, it } from "vitest";
import { buildMeetingWhere, makeSnippet, periodStart } from "../lib/meeting-filter";

describe("buildMeetingWhere", () => {
  it("always excludes trashed meetings", () => {
    const where = buildMeetingWhere({});
    expect(where.AND).toContainEqual({ deletedAt: null });
  });

  it("hides archived meetings when there is no text query", () => {
    const where = buildMeetingWhere({ tag: "weekly" });
    expect(where.AND).toContainEqual({ archivedAt: null });
  });

  it("surfaces archived meetings when a text query is present", () => {
    const where = buildMeetingWhere({ query: "budget" });
    expect(where.AND).not.toContainEqual({ archivedAt: null });
    const or = (where.AND as Record<string, unknown>[]).find((c) => "OR" in c);
    expect(or).toBeDefined();
  });

  it("ignores whitespace-only queries (still hides archived)", () => {
    const where = buildMeetingWhere({ query: "   " });
    expect(where.AND).toContainEqual({ archivedAt: null });
  });

  it("adds tag and period conditions", () => {
    const where = buildMeetingWhere({ tag: "weekly", period: "today" });
    const and = where.AND as Record<string, unknown>[];
    expect(and).toContainEqual({ tags: { some: { name: "weekly" } } });
    expect(and.some((c) => "startedAt" in c)).toBe(true);
  });
});

describe("periodStart", () => {
  it("week starts on Monday", () => {
    // 2026-07-08 is a Wednesday -> Monday is 2026-07-06
    const start = periodStart("week", new Date(2026, 6, 8, 15, 30));
    expect(start?.getDay()).toBe(1);
    expect(start?.getDate()).toBe(6);
    expect(start?.getHours()).toBe(0);
  });

  it("Sunday belongs to the week started the previous Monday", () => {
    // 2026-07-12 is a Sunday -> Monday is 2026-07-06
    const start = periodStart("week", new Date(2026, 6, 12, 9, 0));
    expect(start?.getDate()).toBe(6);
  });

  it("month starts on the 1st", () => {
    const start = periodStart("month", new Date(2026, 6, 8));
    expect(start?.getDate()).toBe(1);
    expect(start?.getMonth()).toBe(6);
  });

  it("returns null for empty period", () => {
    expect(periodStart("")).toBeNull();
  });
});

describe("makeSnippet", () => {
  it("returns null when the query is absent", () => {
    expect(makeSnippet("hello world", "xyz")).toBeNull();
  });

  it("is case-insensitive and adds ellipses on both sides", () => {
    const text = `${"a".repeat(50)} NEEDLE ${"b".repeat(50)}`;
    const snip = makeSnippet(text, "needle");
    expect(snip).toContain("NEEDLE");
    expect(snip?.startsWith("…")).toBe(true);
    expect(snip?.endsWith("…")).toBe(true);
  });
});
