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
//   sherpa WeSpeaker         0.84            0.60           -> 0.5 would match strangers
//
// One number cannot serve both. Storing the model with the profile is what makes a per-model
// threshold possible at all.

export type EmbeddingModelId = "pyannote-community-1" | "sherpa-wespeaker-resnet34";

export type EmbeddingModel = {
  id: EmbeddingModelId;
  label: string;
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
  "sherpa-wespeaker-resnet34": {
    id: "sherpa-wespeaker-resnet34",
    label: "WeSpeaker ResNet34 (sherpa-onnx)",
    // Measured: 0.84 for the same speaker across two clips, 0.60 for two different speakers in
    // the same recording. 0.5 would call those strangers the same person.
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
 * The model the diarization service is producing right now.
 *
 * Enrolment stamps this onto a profile, so the day the service changes model, existing
 * profiles are recognisably *older* rather than merely wrong. Update it in the same change
 * that swaps the model, never separately.
 */
export const CURRENT_EMBEDDING_MODEL: EmbeddingModelId = "pyannote-community-1";

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
