-- AlterTable
ALTER TABLE "meetings" ADD COLUMN "summary_error" TEXT;

-- AlterTable
ALTER TABLE "series" ADD COLUMN "summary_format" TEXT;
ALTER TABLE "series" ADD COLUMN "stt_glossary" TEXT;
