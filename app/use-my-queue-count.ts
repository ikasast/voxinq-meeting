"use client";

import { useEffect, useState } from "react";

/**
 * How much of the queue is yours, polled.
 *
 * One hook, because the rail's badge and the bottom bar's badge are two views of one thing, and
 * two implementations of "how many" would eventually disagree about it in front of somebody.
 *
 * It counts **your own** open work, not the machine's. A badge on a navigation item is read as
 * "things of yours", and the queue lists everybody: three waiting jobs that all belong to
 * somebody else is not a notification, it is a wrong answer to what a badge is asked.
 */
export function useMyQueueCount(): number {
  const [mine, setMine] = useState(0);

  useEffect(() => {
    let stop = false;
    const load = async () => {
      try {
        const res = await fetch("/api/jobs", { cache: "no-store" });
        if (!res.ok || stop) return;
        const d = (await res.json()) as { jobs: { mine?: boolean }[] };
        setMine(d.jobs.filter((j) => j.mine).length);
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

  return mine;
}
