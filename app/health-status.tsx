"use client";

import { useCallback, useEffect, useState } from "react";
import { sttHttpBase } from "@/lib/stt/client";

// Show STT / LLM health as a small indicator on the home page.
// STT is checked browser->STT directly (same path as recording); LLM is checked via the web server.
// Click to re-check.

type Check = {
  ok: boolean | null; // null = checking
  detail?: string;
};

function Dot({ ok }: { ok: boolean | null }) {
  const color =
    ok === null
      ? "bg-[var(--text-muted)] animate-pulse"
      : ok
        ? "bg-[var(--success)]"
        : "bg-[var(--error)]";
  return <span className={`inline-block h-2 w-2 rounded-full ${color}`} />;
}

export function HealthStatus({ showStt }: { showStt: boolean }) {
  const [stt, setStt] = useState<Check>({ ok: null });
  const [llm, setLlm] = useState<Check>({ ok: null });

  const check = useCallback(() => {
    if (showStt) {
      // Right after the Tailscale path wakes from idle, the first connection can take a few seconds
      // -> use a longer timeout + one auto-retry to avoid false negatives.
      const checkStt = async () => {
        setStt({ ok: null });
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const res = await fetch(`${sttHttpBase()}/health`, {
              signal: AbortSignal.timeout(8000),
              cache: "no-store",
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            setStt({ ok: true });
            return;
          } catch (e) {
            if (attempt === 0) {
              await new Promise((r) => setTimeout(r, 2000));
              continue;
            }
            // Keep the failure kind in the display (timeout or network/CORS, etc.).
            const reason =
              e instanceof Error && e.name === "TimeoutError"
                ? "timeout"
                : e instanceof Error
                  ? e.message
                  : String(e);
            setStt({ ok: false, detail: `Cannot reach STT — recording unavailable (${reason})` });
          }
        }
      };
      void checkStt();
    }
    setLlm({ ok: null });
    fetch("/api/health", { signal: AbortSignal.timeout(6000), cache: "no-store" })
      .then((res) => res.json())
      .then((data: { llm?: { ok: boolean; provider: string; detail?: string } }) => {
        if (!data.llm) throw new Error("bad response");
        setLlm({ ok: data.llm.ok, detail: data.llm.detail });
      })
      .catch(() => setLlm({ ok: false, detail: "check failed" }));
  }, [showStt]);

  useEffect(() => {
    check();
  }, [check]);

  const items: { label: string; c: Check }[] = [
    ...(showStt ? [{ label: "Recording (STT)", c: stt }] : []),
    { label: "Minutes (LLM)", c: llm },
  ];

  return (
    <button
      type="button"
      onClick={check}
      title="Click to re-check"
      className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--text-muted)]"
    >
      {items.map(({ label, c }) => (
        <span key={label} className="flex items-center gap-1.5" title={c.detail}>
          <Dot ok={c.ok} />
          {label}
          {c.ok === false && c.detail ? (
            <span className="text-[var(--error)]">— {c.detail}</span>
          ) : null}
        </span>
      ))}
    </button>
  );
}
