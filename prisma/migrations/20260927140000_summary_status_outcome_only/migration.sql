-- summary_status now records only how the last attempt ended: 'done', 'error', or nothing.
-- Whether minutes are being written is read from the jobs (lib/meetings/minutes-state.ts),
-- which is where it cannot go stale.
--
-- Any row still saying 'processing' was written by the old code. A job that is genuinely still
-- queued or running goes on showing as such -- from the queue -- so clearing this loses
-- nothing and frees any meeting that was stuck saying it.
UPDATE "meetings" SET "summary_status" = NULL WHERE "summary_status" = 'processing';
