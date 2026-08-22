// Which model produced a voiceprint, and what "the same person" means for it.
//
// This exists because of a measurement. pyannote's community-1 embeddings and sherpa-onnx's
// WeSpeaker embeddings are **both 256 numbers**, and on the same 12-second clip they score
// 0.39 against each other — different spaces wearing the same shape. Nothing in the matching
// code could tell: `cosineSimilarity` only refuses on a length mismatch, and `mergeEmbedding`
// only replaces on a shape change. Swapping the model would have left every enrolled profile
// silently failing to match, with no error to explain it.
//
// The threshold is part of the model, not a global preference. Measured on the same recording:
//
//                        same speaker   different speakers
//   pyannote community-1     high            low            -> 0.5 separates them
//   sherpa WeSpeaker         0.78            0.42           -> 0.5 would match strangers
//
// One number cannot serve both. Storing the model with the profile is what makes a per-model
// threshold possible at all.
//
// Since v2.0.0-beta.2 there is no single current model: the diarization service runs pyannote
// where there is CUDA and sherpa-onnx where there is not, so which one produced a vector is a
// property of the host, not of this build. It travels with the embedding — from the diarizer,
// through the STT service, to whatever stores it.

export type EmbeddingModelId =
  | "pyannote-community-1"
  | "sherpa-wespeaker-voxceleb"
  | "sherpa-wespeaker-cnceleb";

export type EmbeddingModel = {
  id: EmbeddingModelId;
  label: string;
  /** No longer produced. Profiles from it are kept but never matched. */
  retired?: boolean;
  /** Cosine at or above which two embeddings are treated as the same person. */
  threshold: number;
  dims: number;
};

export const EMBEDDING_MODELS: Record<EmbeddingModelId, EmbeddingModel> = {
  "pyannote-community-1": {
    id: "pyannote-community-1",
    label: "pyannote speaker-diarization-community-1",
    threshold: 0.5,
    dims: 256,
  },
  // Shipped in v2.0.0-beta.1 and withdrawn: trained on English speakers, and not able to
  // separate Japanese ones over a long meeting. Kept so profiles enrolled by that build are
  // recognised as belonging to a model that is no longer in use, rather than compared against
  // the current one.
  "sherpa-wespeaker-voxceleb": {
    id: "sherpa-wespeaker-voxceleb",
    label: "WeSpeaker ResNet34 / VoxCeleb (withdrawn)",
    threshold: 0.7,
    dims: 256,
    retired: true,
  },
  "sherpa-wespeaker-cnceleb": {
    id: "sherpa-wespeaker-cnceleb",
    label: "WeSpeaker ResNet34 / CN-Celeb (sherpa-onnx)",
    // Measured across a real Japanese meeting, segment against segment: same speaker averages
    // 0.78 and drops to 0.69 at the 10th percentile; different speakers average 0.42 and reach
    // 0.62 at the 90th. 0.70 sits above nearly every impostor pair, which is the side to err
    // on — a wrong name on a line is worse than no name.
    threshold: 0.7,
    dims: 256,
  },
};

/**
 * What a profile with no recorded model came from.
 *
 * Everything enrolled before this column existed was produced by pyannote, so that is the only
 * honest default — and it means the change does not invalidate profiles by itself.
 */
export const LEGACY_EMBEDDING_MODEL: EmbeddingModelId = "pyannote-community-1";

/**
 * A model id from outside — a request body, or the STT service's health response.
 *
 * Returns null for anything unrecognised rather than guessing. Null reads as
 * {@link LEGACY_EMBEDDING_MODEL} everywhere below, which is the honest reading of "no model
 * recorded": nothing before v2.0.0 had a second backend to be.
 */
export function parseEmbeddingModelId(value: unknown): EmbeddingModelId | null {
  return typeof value === "string" && value in EMBEDDING_MODELS
    ? (value as EmbeddingModelId)
    : null;
}

export function embeddingModel(id: string | null | undefined): EmbeddingModel {
  return EMBEDDING_MODELS[(id as EmbeddingModelId) ?? LEGACY_EMBEDDING_MODEL]
    ?? EMBEDDING_MODELS[LEGACY_EMBEDDING_MODEL];
}

/** The match threshold for a profile, from its model. */
export function thresholdFor(id: string | null | undefined): number {
  return embeddingModel(id).threshold;
}

/**
 * Can these two embeddings be compared at all?
 *
 * Not "are they the same length" — that is the trap this module exists for.
 */
export function comparable(a: string | null | undefined, b: string | null | undefined): boolean {
  return embeddingModel(a).id === embeddingModel(b).id;
}
