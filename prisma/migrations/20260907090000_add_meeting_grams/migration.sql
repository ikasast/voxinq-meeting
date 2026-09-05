-- CreateTable
CREATE TABLE "meeting_grams" (
    "meeting_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,

    CONSTRAINT "meeting_grams_pkey" PRIMARY KEY ("meeting_id","token")
);

-- CreateIndex
CREATE INDEX "meeting_grams_token_idx" ON "meeting_grams"("token");

-- AddForeignKey
ALTER TABLE "meeting_grams" ADD CONSTRAINT "meeting_grams_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
