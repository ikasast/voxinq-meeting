"use client";

import { useEffect, useState } from "react";

/** One job in the queue, as /api/jobs gives it. A title only for your own. */
export type QueuedJob = {
  id: string;
  kind: string;
  status: string;
  mine?: boolean;
  title?: string | null;
  meetingId?: string | null;
};

/**
 * The queue, polled: everybody's open work, and how much of it is yours.
 *
 * One hook, because the sidebar's badge and its "now running" line are two views of one thing,
 * and two implementations of "how many" would eventually disagree about it in front of somebody.
 *
 * `mine` counts **your own** open work, not the machine's. A badge on a navigation item is read
 * as "things of yours", and the queue lists everybody: three waiting jobs that all belong to
 * somebody else is not a notification, it is a wrong answer to what a badge is asked.
 */
export function useQueue(): { jobs: QueuedJob[]; mine: number } {
  const [jobs, setJobs] = useState<QueuedJob[]>([]);

  useEffect(() => {
    let stop = false;
    const load = async () => {
      try {
        const res = await fetch("/api/jobs", { cache: "no-store" });
        if (!res.ok || stop) return;
        const d = (await res.json()) as { jobs: QueuedJob[] };
        setJobs(d.jobs);
      } catch {
        // Not worth showing. The next poll is five seconds away.
      }
    };
    void load();
    const t = setInterval(() => void load(), 5000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, []);

  return { jobs, mine: jobs.filter((j) => j.mine).length };
}
