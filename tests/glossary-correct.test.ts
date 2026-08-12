import { describe, expect, it } from "vitest";
import {
  chunkUtterances,
  parseGlossaryTerms,
  validateSuggestions,
  type UtteranceForCorrection,
} from "../lib/llm/correct";

describe("parseGlossaryTerms", () => {
  it("splits on commas, newlines and Japanese commas", () => {
    expect(parseGlossaryTerms("Voxinq, pyannote\nAcme、Aurora")).toEqual([
      "Voxinq",
      "pyannote",
      "Acme",
      "Aurora",
    ]);
  });

  it("drops blanks and case-insensitive duplicates", () => {
    expect(parseGlossaryTerms("Voxinq, , voxinq,\n\nAcme")).toEqual(["Voxinq", "Acme"]);
  });

  it("returns nothing for an empty glossary", () => {
    expect(parseGlossaryTerms("   \n  ")).toEqual([]);
  });
});

describe("validateSuggestions", () => {
  const utterances: UtteranceForCorrection[] = [
    { id: "a", text: "ボックシンクの件ですが、来週リリースします" },
    { id: "b", text: "今日は天気がいいですね" },
  ];
  const terms = ["Voxinq", "Acme"];
  const good = '[{"i":0,"before":"ボックシンクの件ですが、来週リリースします","after":"Voxinqの件ですが、来週リリースします"}]';

  it("accepts a well-formed suggestion and maps it to the transcript id", () => {
    expect(validateSuggestions(good, utterances, terms)).toEqual([
      {
        transcriptId: "a",
        before: "ボックシンクの件ですが、来週リリースします",
        after: "Voxinqの件ですが、来週リリースします",
      },
    ]);
  });

  it("unwraps a code fence the model was told not to add", () => {
    expect(validateSuggestions("```json\n" + good + "\n```", utterances, terms)).toHaveLength(1);
  });

  it("returns nothing when the model answers in prose", () => {
    expect(validateSuggestions("修正すべき箇所はありません。", utterances, terms)).toEqual([]);
  });

  it("accepts an explicit empty result", () => {
    expect(validateSuggestions("[]", utterances, terms)).toEqual([]);
  });

  it("drops a hallucinated line number", () => {
    const raw = '[{"i":9,"before":"どこかの発言","after":"Voxinqの発言"}]';
    expect(validateSuggestions(raw, utterances, terms)).toEqual([]);
  });

  it("drops a suggestion whose `before` is not the actual utterance", () => {
    // The model paraphrased what it was given -> `after` cannot be trusted either.
    const raw = '[{"i":0,"before":"ボックシンクの件です","after":"Voxinqの件です"}]';
    expect(validateSuggestions(raw, utterances, terms)).toEqual([]);
  });

  it("drops an edit that introduces no glossary term", () => {
    const raw =
      '[{"i":1,"before":"今日は天気がいいですね","after":"本日は良い天気ですね"}]';
    expect(validateSuggestions(raw, utterances, terms)).toEqual([]);
  });

  it("drops a rewrite that changes the length too much", () => {
    const raw =
      '[{"i":0,"before":"ボックシンクの件ですが、来週リリースします","after":"Voxinq"}]';
    expect(validateSuggestions(raw, utterances, terms)).toEqual([]);
  });

  it("drops a no-op suggestion", () => {
    const raw =
      '[{"i":0,"before":"ボックシンクの件ですが、来週リリースします","after":"ボックシンクの件ですが、来週リリースします"}]';
    expect(validateSuggestions(raw, utterances, terms)).toEqual([]);
  });

  it("keeps only the first suggestion for a given utterance", () => {
    const raw =
      '[{"i":0,"before":"ボックシンクの件ですが、来週リリースします","after":"Voxinqの件ですが、来週リリースします"},' +
      '{"i":0,"before":"ボックシンクの件ですが、来週リリースします","after":"Acmeの件ですが、来週リリースします"}]';
    const out = validateSuggestions(raw, utterances, terms);
    expect(out).toHaveLength(1);
    expect(out[0].after).toContain("Voxinq");
  });

  it("ignores non-object entries and wrong-typed fields", () => {
    const raw = '["nope", null, 42, {"i":"0","before":"x","after":"y"}]';
    expect(validateSuggestions(raw, utterances, terms)).toEqual([]);
  });

  it("returns nothing when the payload is not an array", () => {
    expect(validateSuggestions('{"i":0}', utterances, terms)).toEqual([]);
  });
});

describe("chunkUtterances", () => {
  const many: UtteranceForCorrection[] = Array.from({ length: 10 }, (_, i) => ({
    id: String(i),
    text: "あ".repeat(90), // ~50 tokens each at 1.8 chars/token
  }));

  it("keeps everything in one pass when it fits", () => {
    expect(chunkUtterances(many, 10000)).toHaveLength(1);
  });

  it("splits when it does not fit, losing nothing", () => {
    const chunks = chunkUtterances(many, 150);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.flat()).toHaveLength(10);
    expect(chunks.flat().map((u) => u.id)).toEqual(many.map((u) => u.id));
  });

  it("never drops an utterance that alone exceeds the budget", () => {
    const chunks = chunkUtterances(many, 1);
    expect(chunks.flat()).toHaveLength(10);
    expect(chunks.every((c) => c.length === 1)).toBe(true);
  });

  it("returns no chunks for no utterances", () => {
    expect(chunkUtterances([], 1000)).toEqual([]);
  });
});
