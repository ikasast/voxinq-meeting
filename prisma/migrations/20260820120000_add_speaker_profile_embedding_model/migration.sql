-- Which model produced a voiceprint. Two embedding models can share a dimension and mean
-- entirely different things (measured: pyannote and WeSpeaker are both 256 numbers and score
-- 0.39 on the same clip), so length alone cannot detect a change of model. Without this, a
-- swap leaves every profile silently failing to match.
--
-- Null means "enrolled before this column existed", which can only be pyannote.
ALTER TABLE "speaker_profiles" ADD COLUMN "embedding_model" TEXT;
