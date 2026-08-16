-- Where each utterance sits in the recording, so clicking its timestamp seeks to the words
-- rather than to when the row reached the database (which trails by the utterance's length
-- plus recognition time). Null on existing rows: the player falls back to segments.json.
ALTER TABLE "transcripts" ADD COLUMN "audio_start_ms" INTEGER;
ALTER TABLE "transcripts" ADD COLUMN "audio_end_ms" INTEGER;
