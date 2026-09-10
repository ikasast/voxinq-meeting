"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatDateTimeIn } from "@/lib/i18n/format";
import { useLocale, useT } from "./locale-provider";

// "Your meeting is starting."
//
// A meeting booked from the calendar had a time and nothing that used it: the row moved to
// Upcoming and then sat there while the meeting happened in the room. This is the part that
// says so, and puts the one useful action next to it.
//
// **Two channels, and only one of them can be relied on.** The banner is in the page, so it
// appears whenever the app is open. The OS notification reaches somebody who is looking at
// something else — but only while a browser or the installed app is *running*: there is no push
// service here, deliberately (that would be an outside server holding a channel into a
// self-hosted app). With everything closed, nothing fires. That is a real limit and it is
// written down in the documentation rather than implied by silence.
//
// Permission is asked for on a tap, never on load. A prompt nobody asked for is how a browser
// decides to stop asking on this site's behalf for good.

const POLL_MS = 30_000;
const DISMISSED_KEY = "voxinq.dueDismissed";
const ASKED_KEY = "voxinq.notifyAsked";

type Due = { id: string; title: string; scheduledAt: string | null };

/** Per device, like the theme: seeing it on a phone should not silence the laptop in the room. */
function readDismissed(): string[] {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function remember(ids: string[]) {
  try {
    // Capped: the list only has to outlive the two-hour window the server answers within, and
    // an unbounded key in localStorage is a slow leak nobody goes looking for.
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(ids.slice(-50)));
  } catch {
    // A private window has no storage. The banner then reappears on reload, which is the
    // harmless direction to fail in.
  }
}

export function DueMeetingAlert({ external }: { external: boolean }) {
  const t = useT();
  const locale = useLocale();
  const [due, setDue] = useState<Due[]>([]);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [canAsk, setCanAsk] = useState(false);
  // Which ids have already been shown to the OS on this page, so a 30-second poll does not
  // re-notify the same meeting every 30 seconds.
  const notified = useRef<Set<string>>(new Set());

  useEffect(() => {
    setDismissed(readDismissed());
    if (typeof Notification === "undefined") return;
    let asked = false;
    try {
      asked = localStorage.getItem(ASKED_KEY) === "1";
    } catch {
      // no storage: offer it, and the browser's own answer decides
    }
    setCanAsk(Notification.permission === "default" && !asked);
  }, []);

  const notify = useCallback(
    (m: Due) => {
      if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
      if (notified.current.has(m.id)) return;
      notified.current.add(m.id);
      // Through the service worker where there is one: a notification owned by the page dies
      // with the tab, and this is the case where the tab is not the thing being looked at.
      // `data.url` is what sw.js opens when it is clicked.
      const body = t("It is time for this meeting.");
      const url = external ? `/${m.id}` : `/${m.id}/recording`;
      void navigator.serviceWorker?.ready
        .then((reg) =>
          reg.showNotification(m.title, {
            body,
            tag: `voxinq-due-${m.id}`,
            icon: "/icons/icon-192.png",
            data: { url },
          }),
        )
        .catch(() => {
          try {
            new Notification(m.title, { body, tag: `voxinq-due-${m.id}` });
          } catch {
            // Some browsers only allow the service-worker form. Nothing to fall back to.
          }
        });
    },
    [external, t],
  );

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch("/api/meetings/due", { cache: "no-store" });
        if (!res.ok) return;
        const d = (await res.json()) as { meetings: Due[] };
        if (cancelled) return;
        setDue(d.meetings);
        for (const m of d.meetings) if (!readDismissed().includes(m.id)) notify(m);
      } catch {
        // A failed poll is not worth a message; the next one is thirty seconds away.
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [notify]);

  const showing = due.filter((m) => !dismissed.includes(m.id));
  if (showing.length === 0) return null;

  const dismiss = (id: string) => {
    const next = [...dismissed, id];
    setDismissed(next);
    remember(next);
  };

  const ask = async () => {
    try {
      localStorage.setItem(ASKED_KEY, "1");
    } catch {
      // fine — the browser remembers its own answer
    }
    setCanAsk(false);
    if (typeof Notification === "undefined") return;
    const result = await Notification.requestPermission();
    if (result === "granted") for (const m of showing) notify(m);
  };

  return (
    <div className="border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--accent)_12%,transparent)]">
      {showing.map((m) => (
        <div
          key={m.id}
          className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3"
        >
          <span aria-hidden className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-[var(--accent)]" />
          <p className="min-w-0 flex-1 text-sm text-[var(--text-secondary)]">
            <Link
              href={`/${m.id}`}
              className="font-medium text-[var(--text-strong)] hover:underline"
            >
              {m.title}
            </Link>
            {m.scheduledAt ? (
              <span className="ml-2 text-xs text-[var(--text-muted)]">
                {formatDateTimeIn(locale, m.scheduledAt)}
              </span>
            ) : null}
            <span className="ml-2">{t("It is time for this meeting.")}</span>
          </p>
          {/* Recording needs the transcription service, which an external browser cannot
              reach — so from out there the reminder is a reminder and nothing more. */}
          {!external ? (
            <Link href={`/${m.id}/recording`} className="btn-ink shrink-0 !px-4 !py-1.5 text-sm">
              {t("Start recording")}
            </Link>
          ) : null}
          {canAsk ? (
            <button
              type="button"
              onClick={() => void ask()}
              className="btn-outline shrink-0 !px-3 !py-1.5 text-xs"
              title={t(
                "Show these on this device even when the app is not the window you are looking at. Needs the browser or the installed app to be running — there is no outside push service.",
              )}
            >
              {t("Notify me on this device")}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => dismiss(m.id)}
            className="shrink-0 text-sm text-[var(--text-muted)] hover:text-[var(--text-strong)]"
            aria-label={t("Dismiss")}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
