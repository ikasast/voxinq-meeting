-- AlterTable
ALTER TABLE "meetings" ADD COLUMN     "owner_id" TEXT;

-- CreateIndex
CREATE INDEX "meetings_owner_id_idx" ON "meetings"("owner_id");

-- AddForeignKey
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

