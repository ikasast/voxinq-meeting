-- AlterTable
ALTER TABLE "jobs" ADD COLUMN     "owner_id" TEXT;

-- CreateIndex
CREATE INDEX "jobs_owner_id_idx" ON "jobs"("owner_id");

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

