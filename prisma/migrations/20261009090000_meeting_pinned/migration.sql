-- Pinned to the top of the sidebar. Nullable: nothing is pinned yet, and a version before this
-- one simply does not read it.
ALTER TABLE "meetings" ADD COLUMN "pinned_at" TIMESTAMP(3);
