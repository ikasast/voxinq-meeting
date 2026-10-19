-- Pinned to the top of the sidebar's series. Nullable: nothing is pinned yet, and a version
-- before this one simply does not read it.
ALTER TABLE "series" ADD COLUMN "pinned_at" TIMESTAMP(3);
