-- CreateTable
CREATE TABLE "series" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "series_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "series_name_key" ON "series"("name");

-- AlterTable
ALTER TABLE "meetings" ADD COLUMN "series_id" TEXT;

-- CreateIndex
CREATE INDEX "meetings_series_id_idx" ON "meetings"("series_id");

-- AddForeignKey
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_series_id_fkey" FOREIGN KEY ("series_id") REFERENCES "series"("id") ON DELETE SET NULL ON UPDATE CASCADE;
