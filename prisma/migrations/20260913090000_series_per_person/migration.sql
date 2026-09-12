-- A series becomes one person's: unique by (owner, name) instead of by name alone.
--
-- Until now two people who named a series the same thing got the same row, so each could read
-- and overwrite the other's background, and the other's regular members were copied into their
-- meetings. The existing rows are sorted out before the rule changes.

-- The old rule goes first: sorting the rows out below makes a second 定例 for its second
-- owner, which the instance-wide name index would refuse. The whole file runs as one
-- transaction, so a failure anywhere leaves the old index and the old rows as they were.
DROP INDEX "series_name_key";

-- 1. A series with no owner goes to whoever owns the most meetings in it; the earliest meeting
--    breaks a tie. A series made on its own already has an owner and keeps it.
UPDATE "series" AS s
SET "owner_id" = pick."owner_id"
FROM (
  SELECT DISTINCT ON ("series_id") "series_id", "owner_id"
  FROM (
    SELECT "series_id", "owner_id", count(*) AS n, min("created_at") AS first
    FROM "meetings"
    WHERE "series_id" IS NOT NULL AND "owner_id" IS NOT NULL
    GROUP BY "series_id", "owner_id"
  ) AS per_owner
  ORDER BY "series_id", n DESC, first ASC
) AS pick
WHERE s."id" = pick."series_id" AND s."owner_id" IS NULL;

-- 2. Anybody else with meetings in it gets a series of their own under the same name. Only the
--    name: the background, format, glossary and members were the other person's.
INSERT INTO "series" ("id", "name", "owner_id", "standalone", "created_at")
SELECT gen_random_uuid()::text, s."name", other."owner_id", false, now()
FROM (
  SELECT DISTINCT m."series_id", m."owner_id"
  FROM "meetings" AS m
  JOIN "series" AS s2 ON s2."id" = m."series_id"
  WHERE m."owner_id" IS NOT NULL AND m."owner_id" IS DISTINCT FROM s2."owner_id"
) AS other
JOIN "series" AS s ON s."id" = other."series_id";

-- 3. ...and their meetings move to it.
UPDATE "meetings" AS m
SET "series_id" = mine."id"
FROM "series" AS theirs, "series" AS mine
WHERE m."series_id" = theirs."id"
  AND m."owner_id" IS NOT NULL
  AND m."owner_id" IS DISTINCT FROM theirs."owner_id"
  AND mine."owner_id" = m."owner_id"
  AND mine."name" = theirs."name"
  AND mine."id" <> theirs."id";

-- CreateIndex. NULLS NOT DISTINCT so that an instance without accounts, where no series has an
-- owner, still has one series per name, which is the rule it always had.
CREATE UNIQUE INDEX "series_owner_id_name_key" ON "series"("owner_id", "name") NULLS NOT DISTINCT;
