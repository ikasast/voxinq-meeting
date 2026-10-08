-- How each line was said against its speaker's own average (Voice cues). Nullable: nothing has
-- been measured yet, and a version before this one simply does not read it.
ALTER TABLE "transcripts" ADD COLUMN "voice" TEXT;
