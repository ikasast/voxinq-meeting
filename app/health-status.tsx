"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { currentMinutesBusy } from "@/lib/minutes-busy";
import { sttHttpBase } from "@/lib/stt/client";
import { preloadStt, sttHealth, sttWarmupFromSettings } from "@/lib/stt/preload";
import { useT } from "./locale-provider";

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
  const t = useT();
  const [stt, setStt] = useState<Check>({ ok: null });
  const [llm, setLlm] = useState<Check>({ ok: null });
  const [db, setDb] = useState<Check>({ ok: null });
  // Whisper model currently resident in VRAM (undefined = unknown, null = released).
  const [loaded, setLoaded] = useState<string | null | undefined>(undefined);
  const [warming, setWarming] = useState(false);
  const [warmMsg, setWarmMsg] = useState<string | null>(null);
  const warmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
            const d = (await res.json().catch(() => null)) as { loaded?: string | null } | null;
            setLoaded(d ? (d.loaded ?? null) : undefined);
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
            setStt({
              ok: false,
              detail: t("Cannot reach STT — recording unavailable ({reason})", { reason }),
            });
          }
        }
      };
      void checkStt();
    }
    setLlm({ ok: null });
    setDb({ ok: null });
    fetch("/api/health", { signal: AbortSignal.timeout(6000), cache: "no-store" })
      .then((res) => res.json())
      .then(
        (data: {
          db?: { ok: boolean; detail?: string };
          llm?: { ok: boolean; provider: string; detail?: string };
        }) => {
          if (!data.llm) throw new Error("bad response");
          setLlm({ ok: data.llm.ok, detail: data.llm.detail });
          setDb(data.db ? { ok: data.db.ok, detail: data.db.detail } : { ok: false });
        },
      )
      .catch(() => {
        setLlm({ ok: false, detail: t("check failed") });
        // A failing health endpoint usually IS a DB outage (pages 500) — mark it red too.
        setDb({ ok: false, detail: t("check failed") });
      });
  }, [showStt, t]);

  useEffect(() => {
    check();
  }, [check]);

  useEffect(() => {
    return () => {
      if (warmTimer.current) clearTimeout(warmTimer.current);
    };
  }, []);

  // Load the Whisper model now so the next recording starts transcribing immediately
  // (a cold load takes tens of seconds, which is the "Preparing" wait at the start of a
  // meeting). Refused while minutes are generating: the two don't fit in VRAM together.
  const warmUp = useCallback(async () => {
    setWarming(true);
    setWarmMsg(null);
    const mb = await currentMinutesBusy();
    if (mb.busy) {
      setWarming(false);
      setWarmMsg(
        t("Minutes are being generated — the GPU is busy. Try again once they finish."),
      );
      return;
    }
    const { model, translate } = await sttWarmupFromSettings();
    const res = await preloadStt(model, translate);
    if (res === null) {
      setWarming(false);
      setWarmMsg(t("Could not reach STT."));
      return;
    }
    if (res === "ready") {
      setWarming(false);
      setLoaded(model ?? null);
      return;
    }
    // Poll until the model is resident (or give up quietly and let the next check show it).
    const deadline = Date.now() + 180_000;
    const poll = async () => {
      const h = await sttHealth(6000);
      if (h?.loaded) {
        setLoaded(h.loaded);
        setWarming(false);
        return;
      }
      if (Date.now() > deadline) {
        setWarming(false);
        setWarmMsg(t("Model load is taking longer than expected."));
        return;
      }
      warmTimer.current = setTimeout(() => void poll(), 3000);
    };
    warmTimer.current = setTimeout(() => void poll(), 3000);
  }, [t]);

  const items: { id: string; label: string; c: Check }[] = [
    ...(showStt ? [{ id: "stt", label: t("Recording (STT)"), c: stt }] : []),
    { id: "llm", label: t("Minutes (LLM)"), c: llm },
    { id: "db", label: t("DB"), c: db },
  ];

  // Model state is only meaningful when STT is reachable.
  const showWarmUp = showStt && stt.ok === true && !loaded;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--text-muted)]">
      <button
        type="button"
        onClick={check}
        title={t("Click to re-check")}
        className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--text-muted)]"
      >
        {items.map(({ id, label, c }) => (
          <span key={id} className="flex items-center gap-1.5" title={c.detail}>
            <Dot ok={c.ok} />
            {label}
            {c.ok === false && c.detail ? (
              <span className="text-[var(--error)]">— {c.detail}</span>
            ) : null}
            {id === "stt" && c.ok === true && loaded ? (
              <span
                className="text-[var(--accent-sub)]"
                title={t("Whisper model loaded: {model}", { model: loaded })}
              >
                — {t("ready")}
              </span>
            ) : null}
          </span>
        ))}
      </button>
      {showWarmUp ? (
        <button
          type="button"
          onClick={() => void warmUp()}
          disabled={warming}
          title={t("Load the Whisper model now so recording starts transcribing immediately")}
          className="rounded-full border border-[var(--border-strong)] px-2.5 py-0.5 text-[11px] text-[var(--text-secondary)] hover:bg-[var(--hover-surface)] disabled:opacity-50"
        >
          {warming ? t("Loading model…") : t("Warm up")}
        </button>
      ) : null}
      {warmMsg ? <span className="text-[var(--warning)]">{warmMsg}</span> : null}
    </div>
  );
}
