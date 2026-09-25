-- A line split off another at a speaker change points back at the line it came from, so the
-- split can be undone. Null for every existing line: nothing has been split yet.
ALTER TABLE "transcripts" ADD COLUMN "split_of_id" TEXT;
