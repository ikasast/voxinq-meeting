"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { QueueIcon } from "./icons";

// The queue, from a phone.
//
// The rail that carries it only exists on a desktop-width window, so on a phone there was no
// way to reach the queue at all except by typing the address — which is a poor place to hide
// the screen that answers "has my minutes finished yet".
//
// The badge counts **your own** open work, not the machine's. A badge on a navigation item is
// read as "things of yours", and the queue lists everybody now: three waiting jobs that all
// belong to somebody else is not a notification, it is a lie about your own.
/**
 * How much of the queue is yours, polled.
 *
 * Exported so the rail's badge and the phone header's badge are the same number. They are two
 * views of one thing, and two implementations of "how many" would eventually disagree about it
 * in front of somebody.
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

export function QueueHeaderLink() {
  const mine = useMyQueueCount();
  return (
    <Link
      href="/queue"
      className="btn-icon relative"
      title={mine > 0 ? `Queue — ${mine} of yours waiting or running` : "Queue"}
      aria-label="Queue"
    >
      <QueueIcon />
      {mine > 0 ? (
        <span className="absolute -right-1 -top-1 min-w-[15px] rounded-full bg-[var(--accent-solid)] px-1 text-center text-[10px] font-semibold leading-[15px] text-[var(--accent-contrast)]">
          {mine}
        </span>
      ) : null}
    </Link>
  );
}
