// Voice-profile (voiceprint) helpers: cosine matching between diarization cluster
// embeddings and enrolled speaker profiles. Embeddings are speaker centroids (float arrays),
// stored as JSON strings in the DB alongside the id of the model that produced them.
//
// Two embeddings from different models are not comparable even when they are the same length —
// see lib/embedding-models.ts, which is where that lesson and the per-model thresholds live.

import { LEGACY_EMBEDDING_MODEL, comparable, thresholdFor } from "./embedding-models";

/** Kept for callers that predate per-model thresholds; prefer thresholdFor(modelId). */
export const VOICEPRINT_MATCH_THRESHOLD = thresholdFor(LEGACY_EMBEDDING_MODEL);

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return -1;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return -1;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** Parse a JSON float-array embedding; null when malformed. */
export function parseEmbedding(json: string): number[] | null {
  try {
    const v: unknown = JSON.parse(json);
    if (Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === "number" && Number.isFinite(x))) {
      return v as number[];
    }
  } catch {
    // fall through
  }
  return null;
}

/** Validate diarization embeddings from the STT service: {"speaker0": [floats], ...}. */
export function cleanClusterEmbeddings(raw: unknown): Record<string, number[]> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, number[]> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!/^speaker\d+$/.test(key)) continue;
    if (
      Array.isArray(value) &&
      value.length > 0 &&
      value.length <= 4096 &&
      value.every((x) => typeof x === "number" && Number.isFinite(x))
    ) {
      out[key] = value as number[];
    }
  }
  return out;
}

/**
 * Fold a new enrollment into an existing voiceprint as a running mean, so a profile is the
 * centroid of every recording it was enrolled from rather than only the latest one. More
 * samples — different rooms, microphones, moods — make matching steadier, whereas replacing
 * would throw that away and let one bad recording undo a good profile.
 *
 * Returns the merged vector and its new sample count; the vector is the plain average
 * (cosine similarity ignores magnitude, so there is nothing to normalize).
 *
 * Averaging vectors from different models would produce a centroid of nothing, so a change of
 * model replaces rather than merges. Shape alone cannot detect that — two models can share a
 * dimension and mean entirely different things — so the model ids are compared.
 */
export function mergeEmbedding(
  previous: number[] | null,
  previousCount: number,
  next: number[],
  previousModel?: string | null,
  nextModel?: string | null,
): { embedding: number[]; sampleCount: number } {
  if (!comparable(previousModel, nextModel)) {
    return { embedding: next, sampleCount: 1 };
  }
  if (!previous || previous.length !== next.length || previousCount < 1) {
    return { embedding: next, sampleCount: 1 };
  }
  const n = previousCount;
  const merged = previous.map((v, i) => (v * n + next[i]) / (n + 1));
  return { embedding: merged, sampleCount: n + 1 };
}

export type ProfileMatch = { name: string; similarity: number };

/**
 * Match each cluster embedding against enrolled profiles. Greedy one-to-one:
 * best-scoring (cluster, profile) pairs win first, so two clusters cannot both
 * take the same person's name.
 */
export function matchProfiles(
  clusters: Record<string, number[]>,
  profiles: { name: string; embedding: number[]; embeddingModel?: string | null }[],
  /** Which model produced the clusters. Profiles from any other model are skipped. */
  clusterModel?: string | null,
  /** Override the model's own threshold (settings still allow tuning). */
  threshold?: number,
): Record<string, ProfileMatch> {
  const candidates: { cluster: string; name: string; similarity: number }[] = [];
  for (const [cluster, vec] of Object.entries(clusters)) {
    for (const p of profiles) {
      // A profile from another model is not merely a poor match, it is meaningless here —
      // and with equal dimensions the score would look ordinary rather than impossible.
      if (!comparable(clusterModel, p.embeddingModel)) continue;
      const limit = threshold ?? thresholdFor(p.embeddingModel);
      const sim = cosineSimilarity(vec, p.embedding);
      if (sim >= limit) candidates.push({ cluster, name: p.name, similarity: sim });
    }
  }
  candidates.sort((a, b) => b.similarity - a.similarity);
  const usedClusters = new Set<string>();
  const usedNames = new Set<string>();
  const result: Record<string, ProfileMatch> = {};
  for (const c of candidates) {
    if (usedClusters.has(c.cluster) || usedNames.has(c.name)) continue;
    usedClusters.add(c.cluster);
    usedNames.add(c.name);
    result[c.cluster] = { name: c.name, similarity: c.similarity };
  }
  return result;
}
