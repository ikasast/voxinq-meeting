// Voice-profile (voiceprint) helpers: cosine matching between diarization cluster
// embeddings and enrolled speaker profiles. Embeddings are pyannote speaker centroids
// (float arrays), stored as JSON strings in the DB.

// Same-speaker cosine similarity for pyannote centroids is typically well above this;
// different speakers land far below. Conservative enough to avoid false renames.
export const VOICEPRINT_MATCH_THRESHOLD = 0.5;

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

export type ProfileMatch = { name: string; similarity: number };

/**
 * Match each cluster embedding against enrolled profiles. Greedy one-to-one:
 * best-scoring (cluster, profile) pairs win first, so two clusters cannot both
 * take the same person's name.
 */
export function matchProfiles(
  clusters: Record<string, number[]>,
  profiles: { name: string; embedding: number[] }[],
  threshold = VOICEPRINT_MATCH_THRESHOLD,
): Record<string, ProfileMatch> {
  const candidates: { cluster: string; name: string; similarity: number }[] = [];
  for (const [cluster, vec] of Object.entries(clusters)) {
    for (const p of profiles) {
      const sim = cosineSimilarity(vec, p.embedding);
      if (sim >= threshold) candidates.push({ cluster, name: p.name, similarity: sim });
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
