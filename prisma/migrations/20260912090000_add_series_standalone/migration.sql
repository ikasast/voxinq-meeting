-- AlterTable
ALTER TABLE "series" ADD COLUMN     "owner_id" TEXT,
ADD COLUMN     "standalone" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "series_owner_id_idx" ON "series"("owner_id");

-- AddForeignKey
ALTER TABLE "series" ADD CONSTRAINT "series_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

