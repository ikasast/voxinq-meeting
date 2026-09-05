import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { bigrams, gramToken, queryTokens, tokensFor } from "../lib/crypto/gram";
import { newMasterKey } from "../lib/crypto/keys";
import { buildMeetingWhere } from "../lib/meeting-filter";

const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");
const KEY = newMasterKey();

describe("splitting text for the index", () => {
  it("takes overlapping pairs, which is how Japanese substring search works", () => {
    // No spaces to split on, so a word index would need a tokeniser and would still miss the
    // substring searches people actually type.
    expect(bigrams("予算会議")).toEqual(["予算", "算会", "会議"]);
  });

  it("folds case, so Budget finds budget", () => {
    expect(bigrams("Budget")).toEqual(bigrams("budget"));
  });

  it("keeps a space as part of a pair", () => {
    // Dropping spaces would make "the cat" and "thecat" the same query.
    expect(bigrams("a b")).toEqual(["a ", " b"]);
  });

  it("collapses runs of whitespace rather than dropping them", () => {
    expect(bigrams("a   b")).toEqual(bigrams("a b"));
  });

  it("handles a single character and nothing at all", () => {
    expect(bigrams("あ")).toEqual(["あ"]);
    expect(bigrams("")).toEqual([]);
    expect(bigrams("   ")).toEqual([]);
  });
});

describe("the tokens that get stored", () => {
  it("do not contain the text", () => {
    const tokens = tokensFor("来期の予算配分について", KEY);
    expect(tokens.join(" ")).not.toContain("予算");
    expect(tokens.every((t) => /^[A-Za-z0-9_-]+$/.test(t))).toBe(true);
  });

  it("are the same for the same text and key", () => {
    expect(tokensFor("予算", KEY)).toEqual(tokensFor("予算", KEY));
  });

  it("are different for a different account", () => {
    // The point of keying them: two people writing the same sentence must not produce rows that
    // line up, or the index would say who else discussed what.
    const other = newMasterKey();
    expect(gramToken("予算", KEY)).not.toBe(gramToken("予算", other));
  });

  it("are stored once per distinct pair, not once per occurrence", () => {
    // Otherwise the index grows with the length of the meeting and tells anybody with the
    // database exactly how often each pair appears.
    expect(tokensFor("ああああ", KEY)).toHaveLength(1);
  });

  it("cannot be built from a one-character query", () => {
    // There is no pair, so the index cannot help and the caller falls back to reading.
    expect(queryTokens("あ", KEY)).toBeNull();
    expect(queryTokens("", KEY)).toBeNull();
    expect(queryTokens("予算", KEY)).toHaveLength(1);
  });
});

describe("what the search asks the database", () => {
  it("requires every token when there is an index", () => {
    // `contains` against ciphertext matches nothing, so this replaces it entirely.
    const where = buildMeetingWhere({ query: "予算会議", grams: ["a", "b", "c"] });
    const clause = (where.AND as Record<string, unknown>[]).find((c) => "AND" in c);
    expect(clause).toBeDefined();
    expect((clause as { AND: unknown[] }).AND).toHaveLength(3);
  });

  it("falls back to plaintext when there is no key or no pair", () => {
    // An account with no key has all of its content this way, and even an encrypted one keeps
    // its titles in the clear.
    const where = buildMeetingWhere({ query: "予算", grams: null });
    const clause = (where.AND as Record<string, unknown>[]).find((c) => "OR" in c);
    expect(clause).toBeDefined();
  });
});

describe("keeping the index true", () => {
  const indexer = read("lib/crypto/index-meeting.ts");
  const hook = read("lib/crypto/reindex-hook.ts");

  it("rebuilds a meeting whole rather than adding to it", () => {
    // An utterance can be edited or deleted. An index that is only ever added to leaves a
    // meeting findable by a word somebody removed from it, which is the one failure a search
    // index must not have.
    expect(indexer).toContain("meetingGram.deleteMany({ where: { meetingId } })");
  });

  it("indexes the title and description too", () => {
    // One search box should not quietly search two different sets of things.
    expect(indexer).toContain("meeting?.title");
    expect(indexer).toContain("meeting?.description");
  });

  it("leaves the index alone when it cannot read the meeting", () => {
    // Without a key the content cannot be read, so a rebuild would empty the index rather than
    // refresh it. What is there is still correct, just not current.
    expect(indexer).toContain("if (!master) return 0;");
  });

  it("never fails a write because indexing failed", () => {
    // A meeting missing from a search is a worse day; a meeting that failed to save is a lost
    // one. They must not become the same failure.
    expect(hook).toContain("catch (e)");
  });

  it("runs when a meeting ends, not on every utterance", () => {
    // A recording writes one row at a time; rebuilding on each would make a long meeting
    // quadratic.
    expect(read("app/api/meetings/[id]/end/route.ts")).toContain("reindexAfterWrite(id)");
    expect(read("app/api/transcripts/route.ts")).not.toContain("reindexAfterWrite");
  });

  it("catches up an account that was encrypted before the index existed", () => {
    // Their meetings were already encrypted, so nothing would have queued a pass for them and
    // their search would simply have stopped finding anything.
    expect(read("lib/queue/runners/encrypt.ts")).toContain("grams: { none: {} }");
  });
});

describe("what the index reveals, and what it does not", () => {
  it("is written down where somebody will read it", () => {
    // A blind index leaks how many distinct pairs a meeting holds and which meetings share
    // them. That is a real cost, accepted on purpose, and it belongs in prose rather than in
    // nobody's head.
    const gram = read("lib/crypto/gram.ts");
    expect(gram).toContain("What this leaks");
    expect(gram).toContain("frequency and co-occurrence");
  });
});
