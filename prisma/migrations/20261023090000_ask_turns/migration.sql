-- Questions asked about a meeting or a series, and their answers, kept to be read again. A new
-- table only: a version before this one does not know it is there.
CREATE TABLE "ask_turns" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT,
    "meeting_id" TEXT,
    "series_id" TEXT,
    "source" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "meta" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ask_turns_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ask_turns_meeting_id_created_at_idx" ON "ask_turns"("meeting_id", "created_at");
CREATE INDEX "ask_turns_series_id_created_at_idx" ON "ask_turns"("series_id", "created_at");
CREATE INDEX "ask_turns_owner_id_idx" ON "ask_turns"("owner_id");

ALTER TABLE "ask_turns" ADD CONSTRAINT "ask_turns_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ask_turns" ADD CONSTRAINT "ask_turns_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ask_turns" ADD CONSTRAINT "ask_turns_series_id_fkey" FOREIGN KEY ("series_id") REFERENCES "series"("id") ON DELETE CASCADE ON UPDATE CASCADE;
