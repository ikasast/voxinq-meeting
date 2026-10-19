import { readStored } from "@/lib/i18n/stored";
import Link from "next/link";
import { formatDateTimeIn, formatDurationIn, formatShortDateTimeIn, formatSpanIn } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n";
import { jobLabel } from "@/lib/queue/job-label";
import { gpuShare, type JobMetrics, tokensPerSecond } from "@/lib/queue/metrics";
import type { recentJobsAcrossUsers } from "@/lib/queue/queue";

// What the queue did, for looking back at it: how long the meeting was, how long its work
// waited and took, on which model, and whether that model fitted on the card.
//
// The question it answers is usually "why was that one slow". A set of minutes that took twenty
// minutes instead of two is almost always a model that did not fit, and half of it ran on the
// CPU; the share on the GPU is measured when the job ends, so it is here rather than guessed.
//
// One line a job — what it was, which meeting, when — and the rest behind it: the numbers were
// all on the line at once, and a page of them read as a wall. <details>, so opening one needs no
// script and a screen reader can open it too.
//
// Rendered on the server: dates formatted once, in one place, cannot come out differently in
// the browser.

type Row = Awaited<ReturnType<typeof recentJobsAcrossUsers>>[number];

export function QueueHistory({
  rows,
  t,
  locale,
}: {
  rows: Row[];
  t: (k: string, vars?: Record<string, string | number>) => string;
  locale: Locale;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-[var(--text-muted)]">{t("Nothing has finished yet.")}</p>;
  }
  return (
    <ul className="border-t border-[var(--border)]">
      {rows.map((job) => (
        <li key={job.id} className="border-b border-[var(--border)]">
          <details className="group">
            <summary className="flex cursor-pointer list-none items-center gap-3 px-2 py-2.5 hover:bg-[var(--hover-surface)] [&::-webkit-details-marker]:hidden">
              <StatusMark status={job.status} t={t} />
              <span className="w-28 shrink-0 truncate text-sm text-[var(--text-strong)] sm:w-44">{jobLabel(t, job.kind)}</span>
              <span className="min-w-0 flex-1 truncate text-sm text-[var(--text-secondary)]">
                {job.mine && job.meetingId
                  ? job.title || t("(untitled meeting)")
                  : job.owner
                    ? job.owner.name || job.owner.username
                    : "—"}
              </span>
              <span
                className="shrink-0 text-xs tabular-nums text-[var(--text-muted)]"
                title={formatDateTimeIn(locale, job.finishedAt)}
              >
                {formatShortDateTimeIn(locale, job.finishedAt)}
              </span>
              <span aria-hidden className="shrink-0 text-xs text-[var(--text-muted)] transition-transform group-open:rotate-90">
                ›
              </span>
            </summary>
            <div className="pb-3 pr-2">
              <Facts job={job} t={t} locale={locale} />
              {job.status === "error" && job.detail ? (
                <p className="mt-1 break-words pl-7 text-xs text-[var(--error)]">{readStored(t, job.detail)}</p>
              ) : null}
              {job.mine && job.meetingId ? (
                <p className="mt-1.5 pl-7 text-xs">
                  <Link href={`/${job.meetingId}`} className="text-[var(--accent-sub)] hover:underline">
                    {t("Open the meeting")}
                  </Link>
                </p>
              ) : job.owner ? (
                <p className="mt-1 pl-7 text-xs text-[var(--text-muted)]">
                  {t("Somebody else’s work. What it is about is not shown.")}
                </p>
              ) : null}
            </div>
          </details>
        </li>
      ))}
    </ul>
  );
}

function StatusMark({ status, t }: { status: string; t: (k: string) => string }) {
  const [mark, cls, label] =
    status === "done"
      ? ["✓", "text-[var(--accent-sub)]", t("Done")]
      : status === "error"
        ? ["✕", "text-[var(--error)]", t("Failed")]
        : ["–", "text-[var(--text-muted)]", t("Stopped before it finished")];
  return (
    <span className={`w-4 shrink-0 text-center text-sm ${cls}`} title={label} aria-label={label}>
      {mark}
    </span>
  );
}

/** One line of figures. Each part appears only when it is known. */
function Facts({
  job,
  t,
  locale,
}: {
  job: Row;
  t: (k: string, vars?: Record<string, string | number>) => string;
  locale: Locale;
}) {
  const m: JobMetrics = job.metrics ?? {};
  const parts: { text: string; title?: string; warn?: boolean }[] = [];

  const meeting = formatDurationIn(locale, job.meetingMs);
  if (meeting) parts.push({ text: t("meeting {d}", { d: meeting }) });

  const waited = job.startedAt ? job.startedAt.getTime() - job.createdAt.getTime() : null;
  if (waited !== null && waited >= 1000) {
    parts.push({ text: t("waited {d}", { d: formatSpanIn(locale, waited) ?? "" }) });
  }
  const took =
    job.startedAt && job.finishedAt ? job.finishedAt.getTime() - job.startedAt.getTime() : null;
  if (took !== null) parts.push({ text: t("took {d}", { d: formatSpanIn(locale, took) ?? "" }) });

  // The model, shortened to what tells two apart; the whole name on hover.
  if (m.model) {
    const short = m.model.split("/").pop() ?? m.model;
    parts.push({ text: short, title: m.provider ? `${m.provider}: ${m.model}` : m.model });
  }

  // Where it ran. For a local model, how much of it Ollama managed to hold on the GPU.
  const share = gpuShare(m);
  if (share !== null) {
    const gpu = Math.round(share * 100);
    parts.push(
      gpu >= 100
        ? { text: t("all on the GPU"), title: t("{gb} GB loaded", { gb: gb(m.loadedMb) }) }
        : {
            text: t("GPU {gpu}% / CPU {cpu}%", { gpu, cpu: 100 - gpu }),
            title: t(
              "{gb} GB loaded, {vram} GB of it on the GPU. The rest ran on the CPU, which is much slower.",
              { gb: gb(m.loadedMb), vram: gb(m.gpuMb) },
            ),
            warn: true,
          },
    );
  } else if (m.device) {
    parts.push({ text: m.device === "cuda" ? t("on the GPU") : t("on the CPU") });
  }
  if (m.backend && job.kind !== "minutes") parts.push({ text: m.backend });
  if (m.where && m.where !== "local") parts.push({ text: t("via {where}", { where: m.where }) });

  // What minutes cost, in the model's own units.
  if (m.inputTokens || m.outputTokens) {
    parts.push({
      text: t("{in} in / {out} out tokens", {
        in: (m.inputTokens ?? 0).toLocaleString("en-US"),
        out: (m.outputTokens ?? 0).toLocaleString("en-US"),
      }),
      title: m.numCtx ? t("context {n} tokens", { n: m.numCtx.toLocaleString("en-US") }) : undefined,
    });
  }
  const tps = tokensPerSecond(m);
  if (tps !== null) parts.push({ text: t("{n} tokens/s", { n: tps.toFixed(1) }) });
  if (m.loadMs && m.loadMs >= 1000) {
    parts.push({ text: t("model load {d}", { d: formatSpanIn(locale, m.loadMs) ?? "" }) });
  }
  if (m.calls && m.calls > 1) {
    parts.push({
      text: t("{n} passes", { n: m.calls }),
      title: t("Long enough to be condensed first, then written from the condensed notes."),
    });
  }

  // Speaker separation.
  if (m.speakers !== undefined) parts.push({ text: t("{n} speaker(s)", { n: m.speakers }) });
  if (m.divided) parts.push({ text: t("{n} line(s) divided", { n: m.divided }) });

  if (parts.length === 0) return null;
  return (
    <p className="mt-0.5 flex flex-wrap gap-x-2 pl-7 text-xs text-[var(--text-secondary)]">
      {parts.map((p, i) => (
        <span
          key={i}
          title={p.title}
          className={p.warn ? "font-medium text-[var(--warning)]" : undefined}
        >
          {i > 0 ? "· " : ""}
          {p.text}
        </span>
      ))}
    </p>
  );
}

function gb(mb: number | undefined): string {
  return ((mb ?? 0) / 1024).toFixed(1);
}
