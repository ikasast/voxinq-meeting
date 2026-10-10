import { describe, expect, it } from "vitest";
import { buildMeetingWhere, makeSnippet } from "../lib/meeting-filter";

describe("buildMeetingWhere", () => {
  it("always excludes trashed meetings", () => {
    const where = buildMeetingWhere({});
    expect(where.AND).toContainEqual({ deletedAt: null });
  });

  it("no longer hides anything as archived (archiving was removed in v4)", () => {
    for (const where of [buildMeetingWhere({}), buildMeetingWhere({ query: "budget" })]) {
      expect(JSON.stringify(where)).not.toContain("archivedAt");
    }
  });

  it("searches the text when a query is present", () => {
    const where = buildMeetingWhere({ query: "budget" });
    const or = (where.AND as Record<string, unknown>[]).find((c) => "OR" in c);
    expect(or).toBeDefined();
  });

  it("ignores whitespace-only queries", () => {
    const where = buildMeetingWhere({ query: "   " });
    expect(where.AND).toEqual([{ deletedAt: null }]);
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

describe("the series filter", () => {
  it("narrows to one series by name", () => {
    // By name because `Series.name` is unique and it is what the chip shows, so the URL says
    // what the list is showing.
    const where = buildMeetingWhere({ series: "Weekly standup" });
    expect(where.AND).toContainEqual({ series: { name: "Weekly standup" } });
  });

  it("combines with a search rather than replacing it", () => {
    const where = buildMeetingWhere({ series: "Weekly standup", query: "budget" });
    expect(where.AND).toContainEqual({ series: { name: "Weekly standup" } });
    expect((where.AND as Record<string, unknown>[]).some((c) => "OR" in c)).toBe(true);
  });

  it("ignores a whitespace-only series", () => {
    const where = buildMeetingWhere({ series: "   " });
    expect((where.AND as Record<string, unknown>[]).some((c) => "series" in c)).toBe(false);
  });
});
