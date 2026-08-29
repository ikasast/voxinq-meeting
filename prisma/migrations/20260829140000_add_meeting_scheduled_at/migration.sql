-- When a meeting is expected, as opposed to when it was recorded.
--
-- Until now a meeting came into being by being recorded, so "started" and "created" were the
-- same instant and one column held both. Scheduling one in advance separates them: the row
-- exists days before anybody speaks.
--
-- Nullable, and null means what it always meant -- recorded first, filed after. Only rows with
-- a value here are treated as upcoming, so nothing that already exists changes behaviour.
ALTER TABLE "meetings" ADD COLUMN "scheduled_at" TIMESTAMP(3);
