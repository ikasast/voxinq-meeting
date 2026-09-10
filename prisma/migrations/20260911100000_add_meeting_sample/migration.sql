-- Which meetings were created by "create a sample meeting". Existing rows are not samples.
ALTER TABLE "meetings" ADD COLUMN "sample" BOOLEAN NOT NULL DEFAULT false;
