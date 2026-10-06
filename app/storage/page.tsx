import Link from "next/link";
import { formatDateTimeIn, formatDurationIn } from "@/lib/i18n/format";
import { currentLocale, serverT } from "@/lib/i18n/server";
import { prisma } from "@/lib/prisma";
import { barWidths, formatBytes, type RecordingSize } from "@/lib/storage/usage";
import { sttInternalUrl } from "@/lib/stt/internal";

export const dynamic = "force-dynamic";

// What the reader's meetings take on this machine: the audio, the text, and the rest.
//
// The reader's own meetings, through the scoped client, as with the backup beside it in
// Settings → Data. The text is measured in the database by the meetings found that way; the
// audio is asked of the STT service for exactly those ids, since an id is all it takes to fetch
// a recording from there.
//
// Meetings in the trash are counted: they keep their recording until they are purged.

type TextUsage = {
  transcriptBytes: number;
  transcripts: number;
  minutesBytes: number;
  minutes: number;
  otherBytes: number;
};

async function textUsage(ids: string[]): Promise<TextUsage> {
  const zero = { transcriptBytes: 0, transcripts: 0, minutesBytes: 0, minutes: 0, otherBytes: 0 };
  if (ids.length === 0) return zero;
  // Counted as the characters stored (ciphertext where a transcript is encrypted), not as the
  // pages the database spreads them over: the first is what a meeting adds, the second mostly
  // the database's own bookkeeping.
  const [row] = await prisma.$queryRaw<Record<keyof TextUsage, bigint>[]>`
    SELECT
      (SELECT coalesce(sum(octet_length(text) + coalesce(octet_length(translation), 0)), 0)
         FROM transcripts WHERE meeting_id = ANY(${ids})) AS "transcriptBytes",
      (SELECT count(*) FROM transcripts WHERE meeting_id = ANY(${ids})) AS "transcripts",
      (SELECT coalesce(sum(octet_length(summary_text)), 0)
         FROM meeting_summaries WHERE meeting_id = ANY(${ids})) AS "minutesBytes",
      (SELECT count(*) FROM meeting_summaries WHERE meeting_id = ANY(${ids})) AS "minutes",
      (SELECT coalesce(sum(octet_length(token)), 0) FROM meeting_grams WHERE meeting_id = ANY(${ids}))
      + (SELECT coalesce(sum(
           coalesce(octet_length(description), 0) + coalesce(octet_length(speaker_labels), 0)
           + coalesce(octet_length(diarization_embeddings), 0) + coalesce(octet_length(embedding), 0)
         ), 0) FROM meetings WHERE id = ANY(${ids})) AS "otherBytes"
  `;
  return {
    transcriptBytes: Number(row?.transcriptBytes ?? 0),
    transcripts: Number(row?.transcripts ?? 0),
    minutesBytes: Number(row?.minutesBytes ?? 0),
    minutes: Number(row?.minutes ?? 0),
    otherBytes: Number(row?.otherBytes ?? 0),
  };
}

/** Null when the STT service cannot be asked (not running, or older than this page). */
async function recordingSizes(ids: string[]): Promise<Record<string, RecordingSize> | null> {
  if (ids.length === 0) return {};
  try {
    const res = await fetch(`${sttInternalUrl()}/recordings/sizes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as Record<string, RecordingSize>;
  } catch {
    return null;
  }
}

const COLORS = {
  audio: "var(--accent)",
  transcripts: "#8b5cf6",
  minutes: "#f59e0b",
  other: "var(--text-muted)",
};

export default async function StoragePage() {
  const t = await serverT();
  const locale = await currentLocale();

  const meetings = await prisma.meeting.findMany({
    select: { id: true, title: true, startedAt: true, deletedAt: true, archivedAt: true },
  });
  const ids = meetings.map((m) => m.id);
  const [text, recordings, voiceprints] = await Promise.all([
    textUsage(ids),
    recordingSizes(ids),
    prisma.speakerProfile.findMany({ select: { embedding: true } }),
  ]);

  const recorded = recordings ? Object.values(recordings) : [];
  const audioBytes = recorded.reduce((a, r) => a + r.audio, 0);
  const audioSeconds = recorded.reduce((a, r) => a + (r.seconds ?? 0), 0);
  const otherBytes =
    text.otherBytes +
    recorded.reduce((a, r) => a + r.other, 0) +
    voiceprints.reduce((a, p) => a + Buffer.byteLength(p.embedding), 0);

  const count = (n: number) => n.toLocaleString(locale === "ja" ? "ja-JP" : "en-US");
  const audioLength = formatDurationIn(locale, audioSeconds * 1000);
  const n = recorded.length;
  const parts = [
    {
      key: "audio",
      label: t("Audio recordings"),
      bytes: audioBytes,
      detail: recordings
        ? audioLength
          ? t(n === 1 ? "1 recording, {length}" : "{n} recordings, {length} in all", { n: count(n), length: audioLength })
          : t(n === 1 ? "1 recording" : "{n} recordings", { n: count(n) })
        : t("Not measured"),
    },
    {
      key: "transcripts",
      label: t("Transcripts"),
      bytes: text.transcriptBytes,
      detail: t(text.transcripts === 1 ? "1 utterance" : "{n} utterances", { n: count(text.transcripts) }),
    },
    {
      key: "minutes",
      label: t("Minutes"),
      bytes: text.minutesBytes,
      detail: t(text.minutes === 1 ? "1 set of minutes" : "{n} sets of minutes", { n: count(text.minutes) }),
    },
    {
      key: "other",
      label: t("Other"),
      bytes: otherBytes,
      detail: t("Search index, speaker separation results and voiceprints"),
    },
  ] as const;
  const total = parts.reduce((a, p) => a + p.bytes, 0);
  const widths = barWidths(parts.map((p) => p.bytes));

  const byId = new Map(meetings.map((m) => [m.id, m]));
  const largest = Object.entries(recordings ?? {})
    .filter(([id]) => byId.has(id))
    .sort((a, b) => b[1].audio - a[1].audio)
    .slice(0, 8);
  const biggest = largest[0]?.[1].audio ?? 0;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-strong)]">{t("Storage")}</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">{t("How much room your meetings take on this machine.")}</p>
      </div>

      <section className="card space-y-4 p-6">
        <p className="flex items-baseline gap-3">
          <span className="text-sm text-[var(--text-secondary)]">{t("In all")}</span>
          <span className="text-3xl font-semibold tabular-nums text-[var(--text-strong)]">{formatBytes(total)}</span>
        </p>

        <div
          role="img"
          aria-label={parts.map((p) => `${p.label} ${formatBytes(p.bytes)}`).join(", ")}
          className="flex h-4 w-full overflow-hidden rounded-full bg-[var(--elevated)]"
        >
          {parts.map((p, i) =>
            widths[i] > 0 ? (
              <span key={p.key} style={{ width: `${widths[i]}%`, background: COLORS[p.key] }} className="h-full" />
            ) : null,
          )}
        </div>

        <ul className="grid gap-3 sm:grid-cols-2">
          {parts.map((p) => (
            <li key={p.key} className="flex gap-2.5">
              <span aria-hidden className="mt-1 h-3 w-3 shrink-0 rounded-sm" style={{ background: COLORS[p.key] }} />
              <div className="min-w-0">
                <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
                  <span className="font-medium text-[var(--text-strong)]">{p.label}</span>
                  <span className="tabular-nums text-[var(--foreground)]">
                    {p.key === "audio" && !recordings ? "—" : formatBytes(p.bytes)}
                  </span>
                </p>
                <p className="text-xs text-[var(--text-muted)]">{p.detail}</p>
              </div>
            </li>
          ))}
        </ul>

        {!recordings ? (
          <p className="text-xs text-[var(--warning)]">
            {t("The recordings could not be measured: the transcription service did not answer.")}
          </p>
        ) : null}
      </section>

      {largest.length > 0 ? (
        <section className="card space-y-3 p-6">
          <h2 className="section-title text-sm font-semibold text-[var(--text-strong)]">{t("Largest recordings")}</h2>
          <ul className="space-y-3">
            {largest.map(([id, r]) => {
              const m = byId.get(id)!;
              const length = r.seconds ? formatDurationIn(locale, r.seconds * 1000) : null;
              return (
                <li key={id} className="space-y-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <Link
                      href={`/${id}`}
                      className="min-w-0 truncate text-sm font-medium text-[var(--text-strong)] hover:text-[var(--accent-sub)]"
                    >
                      {m.title}
                    </Link>
                    <span className="shrink-0 text-sm tabular-nums text-[var(--foreground)]">{formatBytes(r.audio)}</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--elevated)]">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${biggest > 0 ? Math.max((r.audio / biggest) * 100, 1) : 0}%`, background: COLORS.audio }}
                    />
                  </div>
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--text-muted)]">
                    <span>
                      {formatDateTimeIn(locale, m.startedAt)}
                      {length ? ` · ${length}` : ""}
                    </span>
                    {r.protected ? (
                      <span className="rounded-full border border-[var(--border-strong)] px-1.5 text-[10px] text-[var(--accent-sub)]">
                        {t("Protected")}
                      </span>
                    ) : null}
                    {m.deletedAt ? (
                      <span className="rounded-full border border-[var(--border-strong)] px-1.5 text-[10px]">{t("In the trash")}</span>
                    ) : m.archivedAt ? (
                      <span className="rounded-full border border-[var(--border-strong)] px-1.5 text-[10px]">{t("Archived")}</span>
                    ) : null}
                  </p>
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-[var(--text-muted)]">
            {t("A recording that ran on after the meeting can be cut down to the meeting with Trim, under its player.")}
          </p>
        </section>
      ) : meetings.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">{t("No meetings yet.")}</p>
      ) : null}

      <p className="text-xs text-[var(--text-muted)]">
        {t(
          "Text is counted as the characters stored, without the database's own overhead. Meetings in the trash count until they are deleted for good.",
        )}
      </p>
    </div>
  );
}
