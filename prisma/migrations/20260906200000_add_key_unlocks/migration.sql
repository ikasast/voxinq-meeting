-- CreateTable
CREATE TABLE "key_unlocks" (
    "user_id" TEXT NOT NULL,
    "wrapped" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "key_unlocks_pkey" PRIMARY KEY ("user_id")
);

-- AddForeignKey
ALTER TABLE "key_unlocks" ADD CONSTRAINT "key_unlocks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

