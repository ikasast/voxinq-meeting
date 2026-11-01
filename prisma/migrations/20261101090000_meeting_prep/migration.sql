-- Questions and a running summary prepared while a talk is still being recorded. One new column
-- with a default and one new table: a version before this one does not know they are there.
ALTER TABLE "meetings" ADD COLUMN "prep_enabled" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "meeting_preps" (
    "meeting_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "through_at" TIMESTAMP(3),
    "ran_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meeting_preps_pkey" PRIMARY KEY ("meeting_id")
);

ALTER TABLE "meeting_preps" ADD CONSTRAINT "meeting_preps_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
