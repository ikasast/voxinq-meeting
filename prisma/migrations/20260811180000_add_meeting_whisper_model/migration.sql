-- Per-meeting transcription model, so the choice made when setting up the meeting survives a
-- reload of the recording screen (it used to live only in the URL query).
ALTER TABLE "meetings" ADD COLUMN "whisper_model" TEXT;
