"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { sttHttpBase } from "@/lib/stt/client";
import { formatDateTimeIn } from "@/lib/i18n/format";
import { CheckIcon } from "./icons";
import { useLocale, useT } from "./locale-provider";

// The first-run checklist, above "Start a meeting" on the home page, for whoever runs the
// machine (app/api/setup-checklist). An install started from the compose file alone comes up
// working but not ready: dates in UTC, no model to write minutes with, and nothing yet to say
// whether a phone can reach it. Each of those used to be a command in the README; here each is a
// line that says where it stands and, where it can, a button that settles it.
//
// Four items count. "Try it" does not: it is advice, not something missing. Once the four are
// done the card shrinks to one line, and closing it closes it for every administrator.

const DOCS = "https://github.com/ikasast/voxinq-meeting/blob/release/docs";

type PullState = { status: string; completed: number; total: number; done: boolean; error: string | null };

type Status =
  | { show: false }
  | {
      show: true;
      timeZone: { chosen: string | null; effective: string };
      minutes:
        | { provider: "ollama"; model: string; reachable: boolean; installed: boolean; pull: PullState | null }
        | { provider: "anthropic" | "openai"; model: string };
      phone: { at: string; via: "app" | "browser" } | null;
      sttUrlSet: boolean;
    };

type Stt = { reachable: false } | { reachable: true; device: string; live: boolean };

type Item = { id: string; done: boolean | null; title: string; body: ReactNode };

const gb = (bytes: number) => (bytes / 1024 ** 3).toFixed(1);

export function SetupChecklist() {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const [status, setStatus] = useState<Status | null>(null);
  const [stt, setStt] = useState<Stt | null>(null);
  const [llmOk, setLlmOk] = useState<{ ok: boolean; detail?: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [here] = useState(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
    } catch {
      return null;
    }
  });

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/setup-checklist", { cache: "no-store" });
      if (res.ok) setStatus((await res.json()) as Status);
    } catch {
      // Leave what is on screen; the next look tries again.
    }
  }, []);

  const checkStt = useCallback(async () => {
    try {
      const res = await fetch(`${sttHttpBase()}/health`, { signal: AbortSignal.timeout(8000), cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const d = (await res.json()) as { device?: string; liveTranscription?: boolean };
      setStt({ reachable: true, device: d.device ?? "", live: d.liveTranscription !== false });
    } catch {
      setStt({ reachable: false });
    }
  }, []);

  useEffect(() => {
    void load();
    void checkStt();
    const onFront = () => {
      if (document.visibilityState === "visible") {
        void load();
        void checkStt();
      }
    };
    document.addEventListener("visibilitychange", onFront);
    return () => document.removeEventListener("visibilitychange", onFront);
  }, [load, checkStt]);

  // While a model downloads, follow it; and keep looking for the phone while it has not been
  // seen, since the point is to watch this line turn green after opening the page on the phone.
  const pulling = status?.show && status.minutes.provider === "ollama" && status.minutes.pull && !status.minutes.pull.done;
  const waitingForPhone = status?.show && !status.phone;
  useEffect(() => {
    if (!pulling && !waitingForPhone) return;
    const every = window.setInterval(() => void load(), pulling ? 2000 : 10_000);
    return () => window.clearInterval(every);
  }, [pulling, waitingForPhone, load]);

  // A provider other than Ollama is ready when it answers (or has a key); /api/health knows.
  const provider = status?.show ? status.minutes.provider : null;
  useEffect(() => {
    if (!provider || provider === "ollama") return;
    void fetch("/api/health", { cache: "no-store" })
      .then((r) => r.json() as Promise<{ llm?: { ok: boolean; detail?: string } }>)
      .then((d) => setLlmOk(d.llm ?? null))
      .catch(() => setLlmOk(null));
  }, [provider]);

  const act = async (id: string, run: () => Promise<Response>) => {
    setBusy(id);
    setError(null);
    try {
      const res = await run();
      if (!res.ok) {
        const d = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(d?.error ?? `HTTP ${res.status}`);
      }
      return res;
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setBusy(null);
    }
  };

  if (!status?.show) return null;

  const chooseZone = async (zone: string) => {
    const ok = await act("tz", () =>
      fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timeZone: zone }),
      }),
    );
    if (ok) {
      await load();
      // The dates on this page were written in the old zone.
      router.refresh();
    }
  };

  const download = async (model: string) => {
    const ok = await act("pull", () =>
      fetch("/api/ollama/pull", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model }),
      }),
    );
    if (ok) await load();
  };

  const sample = async () => {
    const res = await act("sample", () => fetch("/api/meetings/sample", { method: "POST" }));
    const d = res ? ((await res.json().catch(() => null)) as { id?: string } | null) : null;
    if (d?.id) router.push(`/${d.id}`);
  };

  const dismiss = async () => {
    const ok = await act("dismiss", () =>
      fetch("/api/setup-checklist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dismiss: true }),
      }),
    );
    if (ok) setStatus({ show: false });
  };

  // ---- Time zone ----
  const tz = status.timeZone;
  const timeZoneItem: Item = {
    id: "tz",
    done: tz.chosen !== null,
    title: t("Time zone"),
    body: tz.chosen ? (
      <p>{t("Dates are shown in {zone}.", { zone: tz.chosen })}</p>
    ) : (
      <>
        <p>
          {here && here !== tz.effective
            ? t("Dates are shown in {zone}. This browser is in {here}.", { zone: tz.effective, here })
            : t("Dates are shown in {zone}.", { zone: tz.effective })}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {here ? (
            <button type="button" className="btn-outline !py-1 !text-xs" disabled={busy !== null} onClick={() => void chooseZone(here)}>
              {t("Use {zone}", { zone: here })}
            </button>
          ) : null}
          <Link href="/admin?tab=machine" className="btn-outline !py-1 !text-xs">
            {t("Choose another")}
          </Link>
        </div>
      </>
    ),
  };

  // ---- The model that writes the minutes ----
  const m = status.minutes;
  let minutesItem: Item;
  if (m.provider === "ollama") {
    const pull = m.pull;
    const running = pull && !pull.done;
    minutesItem = {
      id: "minutes",
      done: m.installed,
      title: t("Model that writes the minutes"),
      body: m.installed ? (
        <p>{t("{model} is ready.", { model: m.model })}</p>
      ) : !m.reachable ? (
        <p>{t("Cannot reach Ollama. Is its container running?")}</p>
      ) : running ? (
        <>
          <p>{t("Downloading {model}. It carries on if you close this page.", { model: m.model })}</p>
          <div className="mt-2 flex items-center gap-3">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--border)]">
              <div
                className="h-full rounded-full bg-[var(--accent)] transition-[width]"
                style={{ width: pull.total > 0 ? `${Math.round((pull.completed / pull.total) * 100)}%` : "4%" }}
              />
            </div>
            <span className="shrink-0 text-xs tabular-nums text-[var(--text-muted)]">
              {pull.total > 0 ? `${gb(pull.completed)} / ${gb(pull.total)} GB` : pull.status}
            </span>
          </div>
        </>
      ) : (
        <>
          <p>
            {pull?.error
              ? t("The download stopped: {reason}", { reason: pull.error })
              : t("{model} is not downloaded yet. Minutes cannot be written without it.", { model: m.model })}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className="btn-outline !py-1 !text-xs" disabled={busy !== null} onClick={() => void download(m.model)}>
              {pull?.error ? t("Try again") : t("Download {model}", { model: m.model })}
            </button>
            <Link href="/settings?tab=llm" className="btn-outline !py-1 !text-xs">
              {t("Choose another model")}
            </Link>
          </div>
        </>
      ),
    };
  } else {
    minutesItem = {
      id: "minutes",
      done: llmOk ? llmOk.ok : null,
      title: t("Model that writes the minutes"),
      body: <p>{llmOk && !llmOk.ok ? (llmOk.detail ?? m.model) : t("{model}, outside this machine.", { model: m.model })}</p>,
    };
  }

  // ---- Transcription ----
  const transcriptionItem: Item = {
    id: "stt",
    done: stt ? stt.reachable : null,
    title: t("Transcription"),
    body:
      stt === null ? (
        <p>{t("Checking…")}</p>
      ) : !stt.reachable ? (
        <p>{t("This browser cannot reach the transcription service. It may still be starting: the first start downloads its model.")}</p>
      ) : stt.device === "cuda" ? (
        <p>{t("An NVIDIA GPU is in use: the text appears as people speak.")}</p>
      ) : stt.live ? (
        <p>{t("The text appears as people speak.")}</p>
      ) : (
        <p>
          {t("No GPU is in use: the text appears when the meeting ends.")}{" "}
          <a href={`${DOCS}/setup.md#what-runs-on-what`} target="_blank" rel="noreferrer" className="underline">
            {t("What runs on what")}
          </a>
        </p>
      ),
  };

  // ---- A phone ----
  let phoneAddress: string | null = null;
  try {
    const host = new URL(sttHttpBase()).hostname;
    if (host && !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(host)) phoneAddress = `https://${host}/`;
  } catch {
    phoneAddress = null;
  }
  const phoneItem: Item = {
    id: "phone",
    done: status.phone !== null,
    title: t("Recording from a phone"),
    body: status.phone ? (
      <p>
        {status.phone.via === "app"
          ? t("The Android app reached the transcription service ({when}).", { when: formatDateTimeIn(locale, status.phone.at) })
          : t("A phone's browser reached the transcription service ({when}).", { when: formatDateTimeIn(locale, status.phone.at) })}
      </p>
    ) : !status.sttUrlSet ? (
      <p>
        {t("STT_WS_URL is not set in .env, so a phone has no address for the transcription service.")}{" "}
        <a href={`${DOCS}/remote-access.md`} target="_blank" rel="noreferrer" className="underline">
          {t("How to set it")}
        </a>
      </p>
    ) : (
      <p>
        {phoneAddress
          ? t("Open {address} on the phone, in the Android app or the browser. This line is ticked once it reaches the transcription service.", {
              address: phoneAddress,
            })
          : t("Open this server on the phone, in the Android app or the browser. This line is ticked once it reaches the transcription service.")}
      </p>
    ),
  };

  const items = [timeZoneItem, minutesItem, transcriptionItem, phoneItem];
  const done = items.filter((i) => i.done === true).length;

  if (done === items.length) {
    return (
      <section className="card flex flex-wrap items-center gap-3 px-5 py-3">
        <Mark done />
        <p className="min-w-0 flex-1 text-sm text-[var(--text-strong)]">{t("Everything is set up.")}</p>
        <button type="button" className="btn-outline !py-1 !text-xs" disabled={busy !== null} onClick={() => void dismiss()}>
          {t("Close")}
        </button>
      </section>
    );
  }

  return (
    <section className="card px-5 py-4" aria-labelledby="setup-checklist-title">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="setup-checklist-title" className="text-base font-semibold text-[var(--text-strong)]">
          {t("Getting ready")}{" "}
          <span className="text-sm font-normal text-[var(--text-muted)]">
            {t("{done} of {total} done", { done, total: items.length })}
          </span>
        </h2>
      </div>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-[var(--border)]">
        <div className="h-full rounded-full bg-[var(--success)]" style={{ width: `${(done / items.length) * 100}%` }} />
      </div>
      <ul className="mt-1">
        {items.map((item) => (
          <Row key={item.id} done={item.done} title={item.title}>
            {item.body}
          </Row>
        ))}
        <Row done={null} title={t("Try it")} note={t("Optional")}>
          <p>{t("Run one short meeting through before the first real one.")}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Link href="/quick-record" className="btn-outline !py-1 !text-xs">
              {t("Record for a minute")}
            </Link>
            <button type="button" className="btn-outline !py-1 !text-xs" disabled={busy !== null} onClick={() => void sample()}>
              {t("Create a sample meeting")}
            </button>
          </div>
        </Row>
      </ul>
      {error ? <p className="mt-2 text-xs text-[var(--error)]">{error}</p> : null}
      <div className="mt-1 flex justify-end border-t border-[var(--border)] pt-2">
        <button
          type="button"
          className="text-xs text-[var(--text-muted)] underline-offset-2 hover:underline"
          disabled={busy !== null}
          onClick={() => void dismiss()}
        >
          {t("Close this checklist")}
        </button>
      </div>
    </section>
  );
}

function Row({ done, title, note, children }: { done: boolean | null; title: string; note?: string; children: ReactNode }) {
  return (
    <li className="flex gap-3 border-b border-[var(--border)] py-3 last:border-b-0">
      <Mark done={done} />
      <div className="min-w-0 flex-1 text-xs text-[var(--text-muted)]">
        <p className="text-sm font-medium text-[var(--text-strong)]">
          {title}
          {note ? <span className="ml-2 text-xs font-normal text-[var(--text-muted)]">{note}</span> : null}
        </p>
        <div className="mt-0.5 break-words [&_p]:leading-relaxed">{children}</div>
      </div>
    </li>
  );
}

/** Ticked, still to do, or (null) neither: not checked yet, or not something that counts. */
function Mark({ done }: { done?: boolean | null }) {
  if (done === true) {
    return (
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--success)] text-[var(--paper)] [&_svg]:h-3.5 [&_svg]:w-3.5">
        <CheckIcon />
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className={`mt-0.5 h-5 w-5 shrink-0 rounded-full border-2 ${
        done === false ? "border-[var(--warning)]" : "border-[var(--border)]"
      }`}
    />
  );
}
