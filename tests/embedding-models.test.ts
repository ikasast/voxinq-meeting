import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  EMBEDDING_MODELS,
  LEGACY_EMBEDDING_MODEL,
  comparable,
  embeddingModel,
  parseEmbeddingModelId,
  thresholdFor,
} from "../lib/embedding-models";
import { matchProfiles, mergeEmbedding } from "../lib/voiceprint";

// Numbers measured on real meetings, kept here because they are the reason this module exists.
//
// Cross-model: pyannote and WeSpeaker embeddings are both 256 long and score 0.39 against each
// other on the same clip — different spaces wearing the same shape.
//
// Within CN-Celeb WeSpeaker, measured segment against segment across a Japanese meeting using
// pyannote's labels as truth: same speaker averages 0.78 and falls to 0.69 at the 10th
// percentile; different speakers average 0.42 and reach 0.62 at the 90th.
const MEASURED = {
  crossModel: 0.394,
  same: { mean: 0.781, p10: 0.693 },
  different: { mean: 0.420, p90: 0.623 },
};

describe("thresholds belong to the model", () => {
  it("keeps pyannote where it was", () => {
    expect(thresholdFor("pyannote-community-1")).toBe(0.5);
  });

  it("sets the sherpa model above the score impostor pairs actually reached", () => {
    // Above the 90th percentile of different-speaker pairs: a wrong name on a line is worse
    // than no name, so the threshold errs towards refusing a match.
    const t = EMBEDDING_MODELS["sherpa-wespeaker-cnceleb"].threshold;
    expect(t).toBeGreaterThan(MEASURED.different.p90);
    expect(t).toBeLessThanOrEqual(MEASURED.same.p10 + 0.01);
  });

  it("does not let one threshold serve both models", () => {
    // pyannote's 0.5 sits below where CN-Celeb strangers score, so sharing it would hand out
    // other people's names. This is the whole reason the threshold is a property of the model.
    expect(EMBEDDING_MODELS["pyannote-community-1"].threshold).toBeLessThan(
      MEASURED.different.p90,
    );
  });

  it("keeps the withdrawn model listed so its profiles are still identifiable", () => {
    // v2.0.0-beta.1 enrolled profiles under this. Dropping the entry would make them read as
    // the legacy pyannote model and be compared against, which is the failure this file exists
    // to prevent.
    expect(EMBEDDING_MODELS["sherpa-wespeaker-voxceleb"].retired).toBe(true);
    expect(comparable("sherpa-wespeaker-voxceleb", "sherpa-wespeaker-cnceleb")).toBe(false);
    expect(comparable("sherpa-wespeaker-voxceleb", "pyannote-community-1")).toBe(false);
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

describe("parseEmbeddingModelId guards what comes in from outside", () => {
  it("accepts the ids the diarizer sends", () => {
    expect(parseEmbeddingModelId("pyannote-community-1")).toBe("pyannote-community-1");
    expect(parseEmbeddingModelId("sherpa-wespeaker-cnceleb")).toBe("sherpa-wespeaker-cnceleb");
  });

  it("returns null rather than guessing", () => {
    // Null reads as pyannote downstream, which is the honest reading of "not recorded".
    // Guessing the current model instead would mean a stranger's vector matching by default.
    expect(parseEmbeddingModelId("made-up")).toBeNull();
    expect(parseEmbeddingModelId(null)).toBeNull();
    expect(parseEmbeddingModelId(42)).toBeNull();
    expect(parseEmbeddingModelId({ id: "pyannote-community-1" })).toBeNull();
  });
});

describe("comparability is about the model, not the length", () => {
  it("treats null as the legacy model rather than as unknown", () => {
    expect(comparable(null, "pyannote-community-1")).toBe(true);
    expect(comparable(undefined, undefined)).toBe(true);
  });

  it("refuses across models", () => {
    expect(comparable("pyannote-community-1", "sherpa-wespeaker-cnceleb")).toBe(false);
  });

  it("the two models share a dimension, which is exactly why this is needed", () => {
    // If they differed, cosineSimilarity's length check would have caught the swap for free.
    expect(EMBEDDING_MODELS["pyannote-community-1"].dims).toBe(
      EMBEDDING_MODELS["sherpa-wespeaker-cnceleb"].dims,
    );
    expect(MEASURED.crossModel).toBeLessThan(MEASURED.different.mean + 0.05);
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
      [{ name: "Sato", embedding: [1, 0, 0, 0], embeddingModel: "sherpa-wespeaker-cnceleb" }],
      "pyannote-community-1",
    );
    expect(out.speaker0).toBeUndefined();
  });

  it("matches sherpa profiles when sherpa is what produced the clusters", () => {
    // Both backends are live now — neither is "the old one".
    const out = matchProfiles(
      clusters,
      [{ name: "Sato", embedding: [1, 0, 0, 0], embeddingModel: "sherpa-wespeaker-cnceleb" }],
      "sherpa-wespeaker-cnceleb",
    );
    expect(out.speaker0?.name).toBe("Sato");
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
      "sherpa-wespeaker-cnceleb",
    );
    expect(r.embedding).toEqual([2, 2]);
    expect(r.sampleCount).toBe(1);
  });

  it("keeps merging when the model has not actually changed", () => {
    // A profile with no recorded model is pyannote, so it merges with pyannote.
    const r = mergeEmbedding([0, 0], 3, [4, 4], null, "pyannote-community-1");
    expect(r.sampleCount).toBe(4);
  });

  it("starts over for a legacy profile enrolled again on a sherpa host", () => {
    // Someone moving a database to a machine without CUDA: averaging a pyannote centroid with
    // a WeSpeaker vector would produce a centroid of nothing.
    const r = mergeEmbedding([0, 0], 3, [4, 4], null, "sherpa-wespeaker-cnceleb");
    expect(r.embedding).toEqual([4, 4]);
    expect(r.sampleCount).toBe(1);
  });
});

describe("the diarizer and this module agree on the ids", () => {
  // There is no single current model any more — the STT host picks a backend from its
  // hardware — so the id travels with every vector. If a backend stamps an id this module has
  // never heard of, it silently reads as pyannote and profiles from two spaces get compared.
  // That is the v2.0.0-beta.1 failure, and this is the check that would have caught it.
  const backends = ["backend_pyannote.py", "backend_sherpa.py"];

  for (const file of backends) {
    it(`${file} stamps an id this module knows and still produces`, () => {
      const src = readFileSync(join(__dirname, "..", "diarization", file), "utf-8");
      const id = /^EMBEDDING_MODEL_ID\s*=\s*"([^"]+)"/m.exec(src)?.[1];
      expect(id, `no EMBEDDING_MODEL_ID found in ${file}`).toBeTruthy();
      expect(Object.keys(EMBEDDING_MODELS)).toContain(id);
      expect(EMBEDDING_MODELS[id as keyof typeof EMBEDDING_MODELS].retired).toBeUndefined();
    });
  }

  it("the two backends do not claim to be the same model", () => {
    const ids = backends.map(
      (f) =>
        /^EMBEDDING_MODEL_ID\s*=\s*"([^"]+)"/m.exec(
          readFileSync(join(__dirname, "..", "diarization", f), "utf-8"),
        )?.[1],
    );
    expect(new Set(ids).size).toBe(ids.length);
  });
});
