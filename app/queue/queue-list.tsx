"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { JOB_LABEL, type JobKind, isJobKind } from "@/lib/queue/types";

// What is running and what is waiting for it.
//
// The screen exists because the answer used to be a disabled button. "Busy" told you that you
// could not do the thing; it did not tell you what was in the way, how long it had been going,
// or that the thing you asked for ten minutes ago was still second in line.

export type QueueJob = {
  id: string;
  kind: string;
  status: string;
  meetingId: string | null;
  startedAt: string | null;
  meeting: { title: string } | null;
};

const POLL_MS = 3000;

export function QueueList({ initial }: { initial: QueueJob[] }) {
  const [jobs, setJobs] = useState(initial);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/jobs", { cache: "no-store" });
      if (res.ok) setJobs(((await res.json()) as { jobs: QueueJob[] }).jobs);
    } catch {
      // A failed poll is not worth a message; the next one is three seconds away.
    }
  }, []);

  useEffect(() => {
    const t = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  const move = async (id: string, by: -1 | 1) => {
    const queued = jobs.filter((j) => j.status === "queued").map((j) => j.id);
    const at = queued.indexOf(id);
    const to = at + by;
    if (at < 0 || to < 0 || to >= queued.length) return;
    [queued[at], queued[to]] = [queued[to], queued[at]];
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch("/api/jobs/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: queued }),
      });
      if (!res.ok) throw new Error("Could not reorder the queue");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const cancel = async (job: QueueJob) => {
    setBusyId(job.id);
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${job.id}/cancel`, { method: "POST" });
      if (!res.ok) throw new Error("Could not stop it");
      const d = (await res.json()) as { stopsImmediately?: boolean };
      // Said plainly rather than implied by the row vanishing: recognition carries on at the
      // other end whatever this button does, and only its result is thrown away.
      if (d.stopsImmediately === false) {
        setError(
          "Removed from the queue. The recognition pass already running finishes on the" +
            " transcription service — there is no way to stop one — and its result is discarded.",
        );
      }
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  if (jobs.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-[var(--border)] p-6 text-sm text-[var(--text-muted)]">
        Nothing queued. Minutes, speaker separation and re-transcription wait here for the GPU
        when one is already using it.
      </p>
    );
  }

  const queuedIds = jobs.filter((j) => j.status === "queued").map((j) => j.id);

  return (
    <div className="space-y-2">
      {error ? <p className="text-xs text-[var(--warning)]">{error}</p> : null}
      <ul className="overflow-hidden rounded-lg border border-[var(--border)]">
        {jobs.map((job, i) => {
          const running = job.status === "running";
          const qAt = queuedIds.indexOf(job.id);
          return (
            <li
              key={job.id}
              className="flex items-center gap-3 border-b border-[var(--border)] px-3 py-2.5 last:border-b-0"
            >
              <span
                className={`w-6 shrink-0 text-center text-xs tabular-nums ${
                  running ? "text-[var(--error)]" : "text-[var(--text-muted)]"
                }`}
              >
                {running ? "▶" : qAt + 1}
              </span>
              <div className="min-w-0 flex-1">
                <span className="text-sm font-medium text-[var(--text-strong)]">
                  {isJobKind(job.kind) ? JOB_LABEL[job.kind as JobKind] : job.kind}
                </span>
                <span className="block truncate text-xs text-[var(--text-muted)]">
                  {job.meetingId ? (
                    <Link href={`/${job.meetingId}`} className="hover:underline">
                      {job.meeting?.title || "(untitled meeting)"}
                    </Link>
                  ) : (
                    "—"
                  )}
                </span>
              </div>
              <span className="shrink-0 text-xs text-[var(--text-secondary)]">
                {running ? <Elapsed since={job.startedAt} /> : "waiting"}
              </span>
              <div className="flex shrink-0 items-center gap-1">
                {!running ? (
                  <>
                    <button
                      type="button"
                      onClick={() => void move(job.id, -1)}
                      disabled={busyId !== null || qAt <= 0}
                      className="btn-outline !px-2 !py-1 !text-xs disabled:opacity-30"
                      aria-label="Move up"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => void move(job.id, 1)}
                      disabled={busyId !== null || qAt === queuedIds.length - 1}
                      className="btn-outline !px-2 !py-1 !text-xs disabled:opacity-30"
                      aria-label="Move down"
                    >
                      ↓
                    </button>
                  </>
                ) : null}
                <button
                  type="button"
                  onClick={() => void cancel(job)}
                  disabled={busyId !== null}
                  className="btn-outline !px-2 !py-1 !text-xs text-[var(--error)]"
                >
                  {running ? "Stop" : "Remove"}
                </button>
              </div>
              {i < 0 ? null : null}
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-[var(--text-muted)]">
        One job runs at a time, because Whisper and the LLM do not both fit on an 8&nbsp;GB card.
        A run that is stopped does not go back in the queue — ask for it again when you want it.
      </p>
    </div>
  );
}

/** How long the running one has been going. Cheap reassurance that it has not wedged. */
function Elapsed({ since }: { since: string | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!since) return <>running</>;
  const s = Math.max(0, Math.floor((now - Date.parse(since)) / 1000));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return <span className="tabular-nums">{`${mm}:${ss}`}</span>;
}
