"use client";

import { useCallback, useEffect, useState } from "react";
import { useConfirm } from "../confirm-dialog";
import { useLocale, useT } from "../locale-provider";
import { TrashIcon } from "../icons";
import { formatDateTimeIn } from "@/lib/i18n/format";
import type { ReviewRole } from "@/lib/review/criteria";
import type { ReviewPoint } from "@/lib/review/prompt";
import type { ReviewView } from "@/lib/review/view";
import { showLine } from "./line-bus";
import { openSpeakers } from "./speaker-bus";

// Meeting feedback (an extension), on the meeting's page: pick a role and a person, ask, and the
// feedback appears here when the queue has written it — a score out of 100, each criterion's
// share of it, what went well and what would have helped, each point linked to the lines it
// rests on. Earlier ones for the same meeting stay below, newest first.

export function ReviewPanel({ meetingId, people }: { meetingId: string; people: string[] }) {
  const t = useT();
  const confirm = useConfirm();
  const [role, setRole] = useState<ReviewRole>("facilitator");
  const [person, setPerson] = useState(people[0] ?? "");
  const [reviews, setReviews] = useState<ReviewView[] | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/meetings/${meetingId}/reviews`, { cache: "no-store" });
    if (!res.ok) return;
    const d = (await res.json()) as { reviews: ReviewView[]; jobId: string | null };
    setReviews(d.reviews);
    setJobId(d.jobId);
  }, [meetingId]);
  useEffect(() => {
    void load();
  }, [load]);

  // While a review is queued or being written, follow it; when it ends, read the list again.
  useEffect(() => {
    if (!jobId) return;
    let stop = false;
    const follow = async () => {
      while (!stop) {
        const res = await fetch(`/api/jobs/${jobId}`, { cache: "no-store" }).catch(() => null);
        const job = res?.ok ? ((await res.json()) as { status: string; detail?: string | null; ahead?: number }) : null;
        if (!job) break;
        if (job.status === "queued") {
          setStatus(job.ahead ? t("Waiting — {n} jobs ahead of it.", { n: job.ahead }) : t("Waiting for the GPU to be free…"));
        } else if (job.status === "running") {
          setStatus(t("Writing feedback…"));
        } else {
          if (job.status === "error") setError(job.detail ? t(job.detail) : t("Failed"));
          break;
        }
        await new Promise((r) => setTimeout(r, 3000));
      }
      if (!stop) {
        setStatus(null);
        setJobId(null);
        void load();
      }
    };
    void follow();
    return () => {
      stop = true;
    };
  }, [jobId, load, t]);

  const ask = async () => {
    setError(null);
    const res = await fetch(`/api/meetings/${meetingId}/reviews`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role, person }),
    });
    const d = (await res.json().catch(() => null)) as { jobId?: string; error?: string } | null;
    if (d?.jobId) setJobId(d.jobId);
    else setError(d?.error ? t(d.error) : `HTTP ${res.status}`);
  };

  const remove = async (r: ReviewView) => {
    const ok = await confirm({
      message: t("Delete this feedback for {person}?", { person: r.person }),
      confirmLabel: t("Delete"),
      danger: true,
    });
    if (!ok) return;
    await fetch(`/api/reviews/${r.id}`, { method: "DELETE" }).catch(() => null);
    void load();
  };

  if (people.length === 0) {
    return (
      <div className="border-y border-[var(--border)] py-6 text-sm text-[var(--text-secondary)]">
        <p>{t("Feedback is written for a person, so the speakers need names first.")}</p>
        <button type="button" onClick={() => openSpeakers(meetingId)} className="btn-outline mt-3 !px-3 !py-1 !text-xs">
          {t("Name the speakers")}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3 border-b border-[var(--border)] pb-4">
        <div role="radiogroup" aria-label={t("Role")} className="inline-flex rounded-lg bg-[var(--panel)] p-0.5">
          {(["facilitator", "participant"] as const).map((r) => (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={role === r}
              onClick={() => setRole(r)}
              className={`rounded-md px-3 py-1 text-xs font-medium ${
                role === r ? "bg-[var(--surface)] text-[var(--text-strong)] shadow-sm" : "text-[var(--text-muted)]"
              }`}
            >
              {r === "facilitator" ? t("Facilitator") : t("Participant")}
            </button>
          ))}
        </div>
        <select
          value={person}
          onChange={(e) => setPerson(e.target.value)}
          aria-label={t("Person")}
          className="input !mt-0 !w-auto !py-1 text-sm"
        >
          {people.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <button type="button" onClick={() => void ask()} disabled={!person || jobId !== null} className="btn-soft !px-3 !py-1 !text-xs">
          {t("Write feedback")}
        </button>
        {status ? <span className="text-xs text-[var(--text-muted)]">{status}</span> : null}
        {error ? <span className="text-xs text-[var(--error)]">{error}</span> : null}
      </div>

      {reviews === null ? null : reviews.length === 0 && !jobId ? (
        <p className="text-sm text-[var(--text-muted)]">
          {t("No feedback for this meeting yet. Pick a role and a person, and it is written in the queue like the minutes.")}
        </p>
      ) : (
        reviews.map((r, i) => (
          <ReviewCard key={r.id} review={r} meetingId={meetingId} earlier={i > 0} onDelete={() => void remove(r)} />
        ))
      )}
    </div>
  );
}

function ReviewCard({
  review: r,
  meetingId,
  earlier,
  onDelete,
}: {
  review: ReviewView;
  meetingId: string;
  /** Not the latest: shown a little quieter. */
  earlier: boolean;
  onDelete: () => void;
}) {
  const t = useT();
  const locale = useLocale();
  const m = r.metrics;
  const facts = m
    ? [
        t("talked {n}% of the time", { n: m.share }),
        t(m.questions === 1 ? "1 question" : "{n} questions", { n: m.questions }),
        m.longestTurnSec !== null ? t("longest turn {s} s", { s: m.longestTurnSec }) : null,
      ].filter(Boolean)
    : [];

  return (
    <section className={`space-y-3 ${earlier ? "border-t border-[var(--border)] pt-6 opacity-90" : ""}`}>
      <div className="flex items-baseline gap-3">
        <span className="text-4xl font-bold tabular-nums leading-none text-[var(--text-strong)]">{r.score}</span>
        <span className="text-sm text-[var(--text-muted)]">
          / 100 · {r.role === "facilitator" ? t("Facilitator") : t("Participant")}: {r.person}
        </span>
        <button
          type="button"
          onClick={onDelete}
          title={t("Delete")}
          aria-label={t("Delete this feedback for {person}?", { person: r.person })}
          className="ml-auto inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--hover-surface)] hover:text-[var(--error)]"
        >
          <TrashIcon className="h-3.5 w-3.5" />
        </button>
      </div>
      {facts.length > 0 ? <p className="text-xs text-[var(--text-muted)]">{facts.join(" · ")}</p> : null}
      {r.summary ? <p className="text-sm text-[var(--text-secondary)]">{r.summary}</p> : null}

      {/* Name, bar and comment on one row; on a phone the comment goes under the other two. */}
      <div className="grid grid-cols-[minmax(0,1fr)_5rem] items-center gap-x-3 gap-y-1 text-[13px] sm:grid-cols-[minmax(7rem,11rem)_6rem_minmax(0,1fr)] sm:gap-y-2">
        {r.criteria.map((c) => (
          <div key={c.id} className="contents">
            <span className="text-[var(--foreground)]" title={c.description}>
              {c.name}
            </span>
            <span
              role="img"
              aria-label={c.score !== null ? t("{n} of 5", { n: c.score }) : t("not scored")}
              className="h-1.5 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--text-muted)_22%,transparent)]"
            >
              <span
                className="block h-full rounded-full bg-[var(--accent)]"
                style={{ width: `${c.score !== null ? ((c.score - 1) / 4) * 100 : 0}%` }}
              />
            </span>
            <span className="col-span-2 mb-1.5 text-xs text-[var(--text-secondary)] sm:col-span-1 sm:mb-0">{c.comment}</span>
          </div>
        ))}
      </div>

      <Points title={t("What went well")} points={r.strengths} meetingId={meetingId} />
      <Points title={t("What would have helped")} points={r.improvements} meetingId={meetingId} />

      <p className="text-[11px] text-[var(--text-muted)]">
        {r.model
          ? t("Written {when} by {model}", { when: formatDateTimeIn(locale, r.createdAt), model: r.model })
          : formatDateTimeIn(locale, r.createdAt)}
      </p>
    </section>
  );
}

function Points({ title, points, meetingId }: { title: string; points: ReviewPoint[]; meetingId: string }) {
  const t = useT();
  if (points.length === 0) return null;
  return (
    <div>
      <p className="mb-1 text-[13px] font-semibold text-[var(--text-strong)]">{title}</p>
      <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed">
        {points.map((p, i) => (
          <li key={i}>
            {p.text}
            {p.lineIds.map((id, j) => (
              <button
                key={id}
                type="button"
                onClick={() => showLine(meetingId, id)}
                className="ml-1.5 whitespace-nowrap text-xs text-[var(--accent-sub)] hover:underline"
              >
                {j === 0 ? `▶ ${t("the line")}` : `▶ ${j + 1}`}
              </button>
            ))}
          </li>
        ))}
      </ul>
    </div>
  );
}
