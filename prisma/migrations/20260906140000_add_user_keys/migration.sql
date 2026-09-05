-- AlterTable
ALTER TABLE "users" ADD COLUMN     "key_created_at" TIMESTAMP(3),
ADD COLUMN     "key_salt" TEXT,
ADD COLUMN     "key_wrapped_password" TEXT,
ADD COLUMN     "key_wrapped_recovery" TEXT;

