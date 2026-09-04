-- CreateTable
CREATE TABLE "jobs" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "meeting_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "position" INTEGER NOT NULL DEFAULT 0,
    "vram_mb" INTEGER NOT NULL DEFAULT 0,
    "params" TEXT NOT NULL DEFAULT '{}',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "detail" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "jobs_status_position_idx" ON "jobs"("status", "position");

-- CreateIndex
CREATE INDEX "jobs_meeting_id_idx" ON "jobs"("meeting_id");

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
