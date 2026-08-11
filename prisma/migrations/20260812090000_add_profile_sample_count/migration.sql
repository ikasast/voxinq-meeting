-- How many enrollments are averaged into a profile's embedding. Existing profiles hold a
-- single enrollment, which the default covers.
ALTER TABLE "speaker_profiles" ADD COLUMN "sample_count" INTEGER NOT NULL DEFAULT 1;
