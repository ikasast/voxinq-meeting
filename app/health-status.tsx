"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { sttHttpBase } from "@/lib/stt/client";
import { useT } from "./locale-provider";

// The speech service, the minutes model and the database — said only when one of them is not
// answering (v4). It used to be a row of three green dots on every page, which said "all fine"
// most of the time to nobody who had asked; now nothing shows until something is wrong, and
// then one line above the page says what and what it means.
//
// The speech service is asked from the browser, the way recording reaches it; the other two
// through the web server. Asked again every minute and whenever the window comes back to the
// front, so a fixed problem goes away by itself.
//
// Loading the speech model ahead of a recording ("Warm up") is no longer offered here: the
// meeting page asks for it as soon as it opens (recording-dock.tsx).

type Problem = { id: "stt" | "llm" | "db"; text: string };

/** Below this much room where recordings are kept, it is said. A few working days of meetings. */
export const LOW_DISK_BYTES = 5 * 1024 ** 3;

/** An hour of what the service keeps: 16 kHz, mono, 16-bit. */
const BYTES_PER_HOUR = 16_000 * 2 * 3600;

/** What to say about the room left, or null while there is enough. */
export function lowDisk(free: number | undefined): { gb: string; hours: number } | null {
  if (typeof free !== "number" || !Number.isFinite(free) || free >= LOW_DISK_BYTES) return null;
  return { gb: (free / 1024 ** 3).toFixed(1), hours: Math.floor(free / BYTES_PER_HOUR) };
}

/**
 * `showDisk`: whether to say that the disk is filling up — for whoever can do something about
 * it, which with accounts is an administrator.
 */
export function ServiceAlert({ showStt, showDisk = false }: { showStt: boolean; showDisk?: boolean }) {
  const t = useT();
  const [problems, setProblems] = useState<Problem[]>([]);
  const [disk, setDisk] = useState<{ gb: string; hours: number } | null>(null);
  const [checking, setChecking] = useState(false);

  const check = useCallback(async () => {
    setChecking(true);
    const found: Problem[] = [];

    if (showStt) {
      // Right after the Tailscale path wakes from idle, the first connection can take a few
      // seconds: a longer timeout and one retry, to avoid reporting a problem that is not one.
      let reason: string | null = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const res = await fetch(`${sttHttpBase()}/health`, { signal: AbortSignal.timeout(8000), cache: "no-store" });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const body = (await res.json().catch(() => null)) as { disk?: { free?: number } | null } | null;
          setDisk(showDisk ? lowDisk(body?.disk?.free) : null);
          reason = null;
          break;
        } catch (e) {
          reason = e instanceof Error && e.name === "TimeoutError" ? "timeout" : e instanceof Error ? e.message : String(e);
          if (attempt === 0) await new Promise((r) => setTimeout(r, 2000));
        }
      }
      if (reason) found.push({ id: "stt", text: t("Cannot reach STT — recording unavailable ({reason})", { reason }) });
    }

    try {
      const res = await fetch("/api/health", { signal: AbortSignal.timeout(6000), cache: "no-store" });
      const data = (await res.json()) as {
        db?: { ok: boolean; detail?: string };
        llm?: { ok: boolean; provider: string; detail?: string };
      };
      if (!data.llm) throw new Error("bad response");
      if (!data.llm.ok) {
        found.push({ id: "llm", text: t("Minutes (LLM)") + (data.llm.detail ? ` — ${data.llm.detail}` : "") });
      }
      if (data.db && !data.db.ok) {
        found.push({ id: "db", text: t("DB") + (data.db.detail ? ` — ${data.db.detail}` : "") });
      }
    } catch {
      // A health endpoint that does not answer is, as often as not, the database being down.
      found.push({ id: "db", text: `${t("DB")} — ${t("check failed")}` });
    }

    setProblems(found);
    setChecking(false);
  }, [showStt, showDisk, t]);

  useEffect(() => {
    void check();
    const every = window.setInterval(() => void check(), 60_000);
    const onFront = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onFront);
    return () => {
      window.clearInterval(every);
      document.removeEventListener("visibilitychange", onFront);
    };
  }, [check]);

  const diskNotice = disk ? (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-[color-mix(in_srgb,var(--warning)_35%,transparent)] bg-[color-mix(in_srgb,var(--warning)_10%,var(--paper))] px-4 py-2 text-sm text-[var(--foreground)] lg:px-8"
    >
      <span className="min-w-0 flex-1">
        {t(
          "Only {gb} GB is left where recordings are kept (about {hours} hours of recording). Delete old recordings or free up disk space.",
          { gb: disk.gb, hours: disk.hours },
        )}
      </span>
      <Link href="/storage" className="btn-outline !px-3 !py-1 !text-xs">
        {t("Open storage")}
      </Link>
    </div>
  ) : null;

  if (problems.length === 0) return diskNotice;
  return (
    <>
      {diskNotice}
      <div
        role="alert"
        className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-[color-mix(in_srgb,var(--error)_30%,transparent)] bg-[color-mix(in_srgb,var(--error)_8%,transparent)] px-4 py-2 text-sm text-[var(--error)] lg:px-8"
      >
        <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-[var(--error)]" />
        <span className="min-w-0 flex-1">{problems.map((p) => p.text).join(" · ")}</span>
        <button
          type="button"
          onClick={() => void check()}
          disabled={checking}
          className="shrink-0 text-xs underline-offset-2 hover:underline disabled:opacity-50"
        >
          {checking ? t("Checking…") : t("Check again")}
        </button>
      </div>
    </>
  );
}
