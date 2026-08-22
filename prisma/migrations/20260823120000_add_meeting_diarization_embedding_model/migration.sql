-- Which embedding model produced a meeting's stored diarization embeddings.
--
-- Diarization runs pyannote where there is CUDA and sherpa-onnx where there is not, and the
-- two produce 256-number vectors that score like strangers against each other. Enrolling a
-- voiceprint from these embeddings has to know which space they are in.
--
-- Nullable and with no default on purpose: NULL means "recorded before there was a choice",
-- which the application reads as pyannote (LEGACY_EMBEDDING_MODEL). Additive, so an older
-- release still runs against this schema.
ALTER TABLE "meetings" ADD COLUMN "diarization_embedding_model" TEXT;
