-- CreateTable
CREATE TABLE "meeting_reviews" (
    "id" TEXT NOT NULL,
    "meeting_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "person" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "result" TEXT NOT NULL,
    "criteria" TEXT NOT NULL,
    "metrics" TEXT NOT NULL,
    "participants" TEXT NOT NULL,
    "series_id" TEXT,
    "model" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meeting_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "meeting_reviews_meeting_id_idx" ON "meeting_reviews"("meeting_id");

-- CreateIndex
CREATE INDEX "meeting_reviews_person_idx" ON "meeting_reviews"("person");

-- AddForeignKey
ALTER TABLE "meeting_reviews" ADD CONSTRAINT "meeting_reviews_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

