"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// While minutes are generated in the background, periodically re-render the server component.
// When generation finishes, the parent stops rendering this component, so it stops naturally.
export function SummaryStatusPoller({ intervalMs = 4000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    let timer: number | undefined;
    const tick = () => {
      router.refresh();
      timer = window.setTimeout(tick, intervalMs);
    };
    timer = window.setTimeout(tick, intervalMs);
    return () => window.clearTimeout(timer);
  }, [router, intervalMs]);

  return null;
}
