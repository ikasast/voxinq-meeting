-- AlterTable
ALTER TABLE "meetings" ADD COLUMN "diarization_embeddings" TEXT;

-- CreateTable
CREATE TABLE "speaker_profiles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "embedding" TEXT NOT NULL,
    "source_meeting_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "speaker_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "speaker_profiles_name_key" ON "speaker_profiles"("name");
