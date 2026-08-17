import { describe, expect, it } from "vitest";
import { countMatches, planReplace, replaceAll, TEXT_MAX } from "../lib/find-replace";

const rows = (...texts: string[]) => texts.map((text, i) => ({ id: `t${i}`, text }));

describe("countMatches", () => {
  it("counts non-overlapping occurrences", () => {
    expect(countMatches("aaaa", "aa")).toBe(2);
    expect(countMatches("ネクサス事業のネクサス", "ネクサス")).toBe(2);
  });

  it("ignores case unless asked", () => {
    expect(countMatches("Nexus NEXUS nexus", "nexus")).toBe(3);
    expect(countMatches("Nexus NEXUS nexus", "nexus", { caseSensitive: true })).toBe(1);
  });

  it("is zero for an empty term", () => {
    expect(countMatches("anything", "")).toBe(0);
  });
});

describe("replaceAll", () => {
  it("replaces every occurrence", () => {
    expect(replaceAll("ネクサス事業のネクサス", "ネクサス", "NEXUS")).toBe("NEXUS事業のNEXUS");
  });

  it("writes the replacement verbatim even when matching loosely", () => {
    expect(replaceAll("nexus and NEXUS", "nexus", "NEXUS")).toBe("NEXUS and NEXUS");
  });

  it("treats the term as literal text, not a pattern", () => {
    // A meeting term can contain regex metacharacters; they must match themselves.
    expect(replaceAll("cost (JPY) rose", "(JPY)", "(USD)")).toBe("cost (USD) rose");
    expect(replaceAll("a.b.c", ".", "-")).toBe("a-b-c");
  });

  it("does not rescan its own output", () => {
    // Replacing "a" with "aa" must terminate, not run away.
    expect(replaceAll("aaa", "a", "aa")).toBe("aaaaaa");
  });
});

describe("planReplace", () => {
  it("reports matches and the rows it would change", () => {
    const plan = planReplace(rows("ネクサスの件", "無関係", "ネクサスとネクサス"), "ネクサス", "NEXUS");
    expect(plan.matchedRows).toBe(2);
    expect(plan.totalMatches).toBe(3);
    expect(plan.changes.map((c) => c.id)).toEqual(["t0", "t2"]);
    expect(plan.changes[1].after).toBe("NEXUSとNEXUS");
    expect(plan.changes[1].count).toBe(2);
  });

  it("refuses a replacement that would empty a row", () => {
    // Emptying is a deletion, and deletions must also drop the matching recording boundary or
    // every later utterance gets the wrong speaker. Replace never does that silently.
    const plan = planReplace(rows("はい"), "はい", "");
    expect(plan.changes).toEqual([]);
    expect(plan.skipped).toEqual([{ id: "t0", reason: "empty" }]);
    expect(plan.matchedRows).toBe(1);
  });

  it("refuses a replacement that would exceed the column limit", () => {
    const long = "x".repeat(TEXT_MAX - 1);
    const plan = planReplace(rows(`${long}y`), "y", "z".repeat(10));
    expect(plan.changes).toEqual([]);
    expect(plan.skipped).toEqual([{ id: "t0", reason: "too-long" }]);
  });

  it("skips a row whose text would not actually change", () => {
    const plan = planReplace(rows("NEXUS"), "NEXUS", "NEXUS");
    expect(plan.changes).toEqual([]);
    expect(plan.skipped).toEqual([]);
    expect(plan.matchedRows).toBe(1); // still reported as a match, so the count is honest
  });

  it("returns nothing for an empty term", () => {
    const plan = planReplace(rows("anything"), "", "x");
    expect(plan).toEqual({ changes: [], skipped: [], matchedRows: 0, totalMatches: 0 });
  });

  it("carries the previous text so the caller can preview the change", () => {
    const plan = planReplace(rows("誤り"), "誤り", "正しい");
    expect(plan.changes[0]).toMatchObject({ before: "誤り", after: "正しい" });
  });
});
