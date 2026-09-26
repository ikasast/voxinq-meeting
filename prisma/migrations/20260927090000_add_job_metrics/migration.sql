-- How a finished job ran (lib/queue/metrics.ts). Nullable: older jobs simply have none,
-- and rolling back to a version without it is clean.
ALTER TABLE "jobs" ADD COLUMN "metrics" JSONB;
