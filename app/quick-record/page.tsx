"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { defaultMeetingTitle } from "@/lib/utils";

// Landing point for the home-screen shortcut "new recording".
// Creates a meeting with the default title (datetime) and jumps straight to the recording page (one-tap recording).
export default function QuickRecordPage() {
  const router = useRouter();
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      try {
        const res = await fetch("/api/meetings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: defaultMeetingTitle(),
            description: "",
          }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const m = (await res.json()) as { id: string };
        router.replace(`/${m.id}/recording?autostart=1`);
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, [router]);

  return (
    <div className="mx-auto max-w-md py-24 text-center">
      {error ? (
        <>
          <p className="text-sm text-[var(--error)]">Failed to start recording: {error}</p>
          <button type="button" onClick={() => router.push("/new")} className="btn-ink mt-4">
            Go to New meeting
          </button>
        </>
      ) : (
        <p className="flex items-center justify-center gap-2 text-sm text-[var(--text-muted)]">
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-[var(--border-strong)] border-t-[var(--accent)]" />
          Preparing to record…
        </p>
      )}
    </div>
  );
}
