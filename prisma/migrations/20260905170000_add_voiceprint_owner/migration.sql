-- DropIndex
DROP INDEX "speaker_profiles_name_key";

-- AlterTable
ALTER TABLE "speaker_profiles" ADD COLUMN     "owner_id" TEXT;

-- CreateIndex
CREATE INDEX "speaker_profiles_owner_id_idx" ON "speaker_profiles"("owner_id");

-- CreateIndex
CREATE UNIQUE INDEX "speaker_profiles_owner_id_name_key" ON "speaker_profiles"("owner_id", "name");

-- AddForeignKey
ALTER TABLE "speaker_profiles" ADD CONSTRAINT "speaker_profiles_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

