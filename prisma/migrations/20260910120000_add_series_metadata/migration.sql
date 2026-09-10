-- What every meeting in a series has in common: the background it shares, and the people who
-- are always in it. Both nullable/empty by default, so an existing series is unchanged.

ALTER TABLE "series" ADD COLUMN "description" TEXT;

CREATE TABLE "series_members" (
    "id" TEXT NOT NULL,
    "series_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "series_members_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "series_members_series_id_name_key" ON "series_members"("series_id", "name");
CREATE INDEX "series_members_series_id_idx" ON "series_members"("series_id");

ALTER TABLE "series_members" ADD CONSTRAINT "series_members_series_id_fkey"
    FOREIGN KEY ("series_id") REFERENCES "series"("id") ON DELETE CASCADE ON UPDATE CASCADE;
