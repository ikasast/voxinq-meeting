import { describe, expect, it } from "vitest";
import { cosineSimilarity, mergeEmbedding } from "../lib/voiceprint";

describe("mergeEmbedding", () => {
  it("keeps the first enrollment as-is", () => {
    const r = mergeEmbedding(null, 0, [1, 2, 3]);
    expect(r).toEqual({ embedding: [1, 2, 3], sampleCount: 1 });
  });

  it("averages a second enrollment with the first", () => {
    const r = mergeEmbedding([0, 0], 1, [2, 4]);
    expect(r).toEqual({ embedding: [1, 2], sampleCount: 2 });
  });

  it("weights by how many enrollments are already folded in", () => {
    // Three samples of 0 then one of 4 -> the newcomer moves the mean by a quarter.
    const r = mergeEmbedding([0], 3, [4]);
    expect(r).toEqual({ embedding: [1], sampleCount: 4 });
  });

  it("stays closer to the repeated voice than to a one-off outlier", () => {
    const voice = [1, 0];
    let profile = mergeEmbedding(null, 0, voice);
    for (let i = 0; i < 4; i++) {
      profile = mergeEmbedding(profile.embedding, profile.sampleCount, voice);
    }
    const withOutlier = mergeEmbedding(profile.embedding, profile.sampleCount, [0, 1]);
    expect(cosineSimilarity(withOutlier.embedding, voice)).toBeGreaterThan(0.9);
  });

  it("replaces rather than merges when the vector shape changes", () => {
    // A different pyannote model produces incomparable vectors; averaging them is meaningless.
    const r = mergeEmbedding([1, 2, 3], 5, [1, 2]);
    expect(r).toEqual({ embedding: [1, 2], sampleCount: 1 });
  });
});
