-- Actual recorded audio length in milliseconds, set on meeting end from the WAV duration.
ALTER TABLE "meetings" ADD COLUMN "recorded_ms" INTEGER;
