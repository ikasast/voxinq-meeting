"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { JOB_LABEL, type JobKind, RECORDING_KIND, isJobKind } from "@/lib/queue/types";
import { Avatar } from "../avatar";

// What is running and what is waiting for it.
//
// The screen exists because the answer used to be a disabled button. "Busy" told you that you
// could not do the thing; it did not tell you what was in the way, how long it had been going,
// or that the thing you asked for ten minutes ago was still second in line.

export type QueueJob = {
  id: string;
  kind: string;
  status: string;
  /** Null for somebody else's row: their work is a kind and a person, not a meeting. */
  meetingId: string | null;
  startedAt: string | null;
  vramMb: number;
  mine: boolean;
  title: string | null;
  owner: { username: string; name: string | null; hasImage: boolean } | null;
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
    // Only your own: the reorder endpoint will refuse anybody else's, and offering to move a
    // row that cannot move is worse than not offering.
    const queued = jobs.filter((j) => j.status === "queued" && j.mine).map((j) => j.id);
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

  const queuedIds = jobs.filter((j) => j.status === "queued" && j.mine).map((j) => j.id);

  return (
    <div className="space-y-2">
      {error ? <p className="text-xs text-[var(--warning)]">{error}</p> : null}
      <ul className="overflow-hidden rounded-lg border border-[var(--border)]">
        {jobs.map((job, i) => {
          const running = job.status === "running";
          // A meeting in progress, holding the card. It is in this list so the reason nothing
          // else is starting is visible, not so it can be operated on from here.
          const isRecording = job.kind === RECORDING_KIND;
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
                {/* Your own waiting rows are numbered; somebody else's is a dot, because the
                    number would be a position in a list you are not in. */}
                {running ? "▶" : qAt >= 0 ? qAt + 1 : "·"}
              </span>
              {job.owner ? (
                <Avatar
                  username={job.owner.username}
                  name={job.owner.name}
                  hasImage={job.owner.hasImage}
                  size={26}
                  title={`${job.owner.name || job.owner.username}${job.mine ? " (you)" : ""}`}
                />
              ) : null}
              <div className="min-w-0 flex-1">
                <span className="text-sm font-medium text-[var(--text-strong)]">
                  {isJobKind(job.kind)
                    ? JOB_LABEL[job.kind as JobKind]
                    : isRecording
                      ? "Recording"
                      : job.kind}
                </span>
                <span className="block truncate text-xs text-[var(--text-muted)]">
                  {job.mine && job.meetingId ? (
                    <Link href={`/${job.meetingId}`} className="hover:underline">
                      {job.title || "(untitled meeting)"}
                    </Link>
                  ) : job.owner ? (
                    // Whose, and nothing else. The point of the row is that you can see what is
                    // in front of you — not what it is about.
                    <span title="Somebody else's work. What it is about is not shown.">
                      {job.owner.name || job.owner.username}
                    </span>
                  ) : (
                    "—"
                  )}
                </span>
              </div>
              <span
                className="shrink-0 text-xs text-[var(--text-muted)]"
                title={
                  job.vramMb === 0
                    ? "Uses no video memory — it runs somewhere else, so it does not wait for the card"
                    : "Roughly what it is expected to occupy on the GPU"
                }
              >
                {job.vramMb === 0 ? "off-GPU" : `~${(job.vramMb / 1024).toFixed(1)} GB`}
              </span>
              <span className="shrink-0 text-xs text-[var(--text-secondary)]">
                {running ? <Elapsed since={job.startedAt} /> : "waiting"}
              </span>
              <div className="flex shrink-0 items-center gap-1">
                {!job.mine && !isRecording ? (
                  <span className="text-xs text-[var(--text-muted)]">not yours</span>
                ) : null}
                {isRecording ? (
                  // No Stop: it would hand the GPU to something else while people are still
                  // talking, and would not stop the recording.
                  <span className="text-xs text-[var(--text-muted)]">ends with the meeting</span>
                ) : null}
                {!running && !isRecording && job.mine ? (
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
                {!isRecording && job.mine ? (
                  <button
                    type="button"
                    onClick={() => void cancel(job)}
                    disabled={busyId !== null}
                    className="btn-outline !px-2 !py-1 !text-xs text-[var(--error)]"
                  >
                    {running ? "Stop" : "Remove"}
                  </button>
                ) : null}
              </div>
              {i < 0 ? null : null}
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-[var(--text-muted)]">
        Everybody&rsquo;s work is listed, because the GPU is shared and a queue that hid the
        thing in front of yours could not explain why yours is waiting. For anybody else&rsquo;s
        row you see who it belongs to and what kind of work it is — <strong>not which meeting</strong>
        — and only your own rows can be moved or stopped.
      </p>
      <p className="text-xs text-[var(--text-muted)]">
        How many run at once depends on what they need and what the card has —{" "}
        <em>off-GPU</em> work (recognition sent to an endpoint, minutes written by a cloud model)
        does not wait for it at all. Set the budget in <em>Settings → Transcription</em>. A run
        that is stopped does not go back in the queue — ask for it again when you want it.
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
