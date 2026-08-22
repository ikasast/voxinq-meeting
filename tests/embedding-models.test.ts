import { describe, expect, it } from "vitest";
import {
  CURRENT_EMBEDDING_MODEL,
  EMBEDDING_MODELS,
  LEGACY_EMBEDDING_MODEL,
  comparable,
  embeddingModel,
  thresholdFor,
} from "../lib/embedding-models";
import { matchProfiles, mergeEmbedding } from "../lib/voiceprint";

// Numbers measured on one real meeting, kept here because they are the reason this module
// exists: pyannote and WeSpeaker embeddings are both 256 long and score 0.39 against each
// other on the same 12-second clip. Within WeSpeaker, the same speaker scored 0.84 across two
// clips and two different speakers scored 0.60 — so 0.5 would call strangers the same person.
const MEASURED = { crossModel: 0.394, sherpaSame: 0.843, sherpaDifferent: 0.595 };

describe("thresholds belong to the model", () => {
  it("keeps pyannote where it was", () => {
    expect(thresholdFor("pyannote-community-1")).toBe(0.5);
  });

  it("sets WeSpeaker above the score two different speakers actually reached", () => {
    const t = EMBEDDING_MODELS["sherpa-wespeaker-resnet34"].threshold;
    expect(t).toBeGreaterThan(MEASURED.sherpaDifferent);
    expect(t).toBeLessThan(MEASURED.sherpaSame);
  });

  it("treats an unrecorded model as the one that predates the column", () => {
    expect(embeddingModel(null).id).toBe(LEGACY_EMBEDDING_MODEL);
    expect(embeddingModel(undefined).id).toBe(LEGACY_EMBEDDING_MODEL);
    expect(thresholdFor(null)).toBe(thresholdFor(LEGACY_EMBEDDING_MODEL));
  });

  it("does not fall over on a model id it has never seen", () => {
    expect(embeddingModel("something-else").id).toBe(LEGACY_EMBEDDING_MODEL);
  });
});

describe("comparability is about the model, not the length", () => {
  it("treats null as the legacy model rather than as unknown", () => {
    expect(comparable(null, "pyannote-community-1")).toBe(true);
    expect(comparable(undefined, undefined)).toBe(true);
  });

  it("refuses across models", () => {
    expect(comparable("pyannote-community-1", "sherpa-wespeaker-resnet34")).toBe(false);
  });

  it("the two models share a dimension, which is exactly why this is needed", () => {
    // If they differed, cosineSimilarity's length check would have caught the swap for free.
    expect(EMBEDDING_MODELS["pyannote-community-1"].dims).toBe(
      EMBEDDING_MODELS["sherpa-wespeaker-resnet34"].dims,
    );
  });
});

describe("matchProfiles skips profiles from another model", () => {
  const clusters = { speaker0: [1, 0, 0, 0] };

  it("matches a profile from the same model", () => {
    const out = matchProfiles(
      clusters,
      [{ name: "Sato", embedding: [1, 0, 0, 0], embeddingModel: "pyannote-community-1" }],
      "pyannote-community-1",
    );
    expect(out.speaker0?.name).toBe("Sato");
  });

  it("ignores one from a different model even when it would score perfectly", () => {
    // The danger is not a poor score, it is a plausible one from a meaningless comparison.
    const out = matchProfiles(
      clusters,
      [{ name: "Sato", embedding: [1, 0, 0, 0], embeddingModel: "sherpa-wespeaker-resnet34" }],
      "pyannote-community-1",
    );
    expect(out.speaker0).toBeUndefined();
  });

  it("treats profiles with no recorded model as pyannote", () => {
    const out = matchProfiles(
      clusters,
      [{ name: "Sato", embedding: [1, 0, 0, 0], embeddingModel: null }],
      "pyannote-community-1",
    );
    expect(out.speaker0?.name).toBe("Sato");
  });
});

describe("mergeEmbedding replaces across a model change", () => {
  it("averages within one model", () => {
    const r = mergeEmbedding([0, 0], 1, [2, 2], "pyannote-community-1", "pyannote-community-1");
    expect(r.embedding).toEqual([1, 1]);
    expect(r.sampleCount).toBe(2);
  });

  it("starts over when the model changed, rather than averaging two spaces together", () => {
    const r = mergeEmbedding(
      [0, 0],
      5,
      [2, 2],
      "pyannote-community-1",
      "sherpa-wespeaker-resnet34",
    );
    expect(r.embedding).toEqual([2, 2]);
    expect(r.sampleCount).toBe(1);
  });

  it("keeps merging when the model has not actually changed", () => {
    // A profile with no recorded model is pyannote, so it merges with pyannote.
    const r = mergeEmbedding([0, 0], 3, [4, 4], null, "pyannote-community-1");
    expect(r.sampleCount).toBe(4);
  });

  it("starts over for a legacy profile now that the service produces a different model", () => {
    // This is the re-enrolment the model swap requires, and it is the point: averaging a
    // pyannote centroid with a WeSpeaker vector would produce a centroid of nothing.
    const r = mergeEmbedding([0, 0], 3, [4, 4], null, CURRENT_EMBEDDING_MODEL);
    expect(r.embedding).toEqual([4, 4]);
    expect(r.sampleCount).toBe(1);
  });

  it("the service is producing the model the diarizer stamps on its output", () => {
    // diarization/diarize.py writes EMBEDDING_MODEL_ID; if the two drift, every new profile is
    // labelled with a model that did not make it.
    expect(CURRENT_EMBEDDING_MODEL).toBe("sherpa-wespeaker-resnet34");
  });
});
