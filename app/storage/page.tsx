import type { ReactNode } from "react";
import { formatDateTimeIn, formatDurationIn } from "@/lib/i18n/format";
import { currentLocale, serverT } from "@/lib/i18n/server";
import { prisma } from "@/lib/prisma";
import { barWidths, daysUntil, fateOf, formatMB, type Fate, type RecordingSize } from "@/lib/storage/usage";
import { sttInternalUrl } from "@/lib/stt/internal";
import { TRASH_PURGE_DAYS } from "@/lib/trash";
import { RecordingList, type RecordingRow } from "./recording-list";

export const dynamic = "force-dynamic";

// What the reader's meetings take on this machine.
//
// Two panels, not one bar: audio outweighs text a thousand to one, so together they only ever
// said "it is the audio" (lib/storage/usage.ts). The recordings are split by what becomes of
// them — kept, deleted by the retention sweep, deleted with the trash — which is what decides
// whether the space keeps growing. The text has a scale of its own.
//
// The reader's own meetings, through the scoped client, as with the backup beside it in
// Settings → Data. The text is measured in the database for the meetings found that way; the
// audio is asked of the STT service for exactly those ids, since an id is all it takes to fetch
// a recording from there.

type TextUsage = {
  transcriptBytes: number;
  transcripts: number;
  minutesBytes: number;
  minutes: number;
  otherBytes: number;
  /** Transcript bytes and recorded length of the meetings that have both, for the hourly rate. */
  timedTranscriptBytes: number;
  timedMs: number;
};

async function textUsage(ids: string[]): Promise<TextUsage> {
  const zero = {
    transcriptBytes: 0,
    transcripts: 0,
    minutesBytes: 0,
    minutes: 0,
    otherBytes: 0,
    timedTranscriptBytes: 0,
    timedMs: 0,
  };
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
         ), 0) FROM meetings WHERE id = ANY(${ids})) AS "otherBytes",
      (SELECT coalesce(sum(octet_length(t.text) + coalesce(octet_length(t.translation), 0)), 0)
         FROM transcripts t JOIN meetings m ON m.id = t.meeting_id
         WHERE m.id = ANY(${ids}) AND m.recorded_ms > 0) AS "timedTranscriptBytes",
      (SELECT coalesce(sum(m.recorded_ms), 0) FROM meetings m
         WHERE m.id = ANY(${ids}) AND m.recorded_ms > 0
           AND EXISTS (SELECT 1 FROM transcripts t WHERE t.meeting_id = m.id)) AS "timedMs"
  `;
  return Object.fromEntries(
    Object.keys(zero).map((k) => [k, Number(row?.[k as keyof TextUsage] ?? 0)]),
  ) as TextUsage;
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

// One blue in four strengths, rather than four colours that had nothing to do with each other
// (cyan, a brown that was the warning colour, and grey). The darkest is what stays; the palest
// is what is on its way out. On the dark theme the order of strength holds, with the light end
// as the strong one: light-dark() follows the page's color-scheme.
const BLUE = {
  strong: "light-dark(#1E3A8A, #BFDBFE)",
  firm: "light-dark(#1D4ED8, #93C5FD)",
  mid: "light-dark(#3B82F6, #3B82F6)",
  pale: "light-dark(#BFDBFE, #1E3A8A)",
};
const FATE_COLOR: Record<Fate, string> = {
  protected: BLUE.strong,
  kept: BLUE.firm,
  expiring: BLUE.mid,
  trash: BLUE.pale,
};
const TEXT_COLOR = { transcripts: BLUE.strong, minutes: BLUE.mid, other: BLUE.pale };

type Part = { key: string; label: string; detail: string | null; bytes: number; color: string };

/** A panel: its total, one bar in its own proportions, and a row per part. */
function Panel({ title, total, sub, parts, children }: {
  title: string;
  total: string;
  sub: string | null;
  parts: Part[];
  children?: ReactNode;
}) {
  const widths = barWidths(parts.map((p) => p.bytes));
  return (
    <section className="space-y-3 border-t border-[var(--border)] pt-5">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-sm font-semibold text-[var(--text-strong)]">{title}</h2>
        <span className="text-2xl font-semibold tabular-nums text-[var(--text-strong)]">{total}</span>
        {sub ? <span className="text-xs text-[var(--text-muted)]">{sub}</span> : null}
      </div>
      <div
        role="img"
        aria-label={parts.map((p) => `${p.label} ${formatMB(p.bytes)}`).join(", ")}
        className="flex h-3 w-full overflow-hidden rounded-full bg-[var(--elevated)]"
      >
        {parts.map((p, i) =>
          widths[i] > 0 ? (
            <span key={p.key} style={{ width: `${widths[i]}%`, background: p.color }} className="h-full" />
          ) : null,
        )}
      </div>
      <ul className="space-y-1.5">
        {parts.map((p) => (
          <li key={p.key} className="flex items-baseline gap-2.5 text-sm">
            <span aria-hidden className="h-2.5 w-2.5 shrink-0 self-center rounded-sm" style={{ background: p.color }} />
            {/* The label keeps its line; a long detail wraps beside it instead (on a phone). */}
            <span className="shrink-0 text-[var(--foreground)]">{p.label}</span>
            {p.detail ? <span className="min-w-0 text-xs text-[var(--text-muted)]">{p.detail}</span> : null}
            <span className="ml-auto shrink-0 tabular-nums text-[var(--text-strong)]">{formatMB(p.bytes)}</span>
          </li>
        ))}
      </ul>
      {children}
    </section>
  );
}

export default async function StoragePage() {
  const t = await serverT();
  const locale = await currentLocale();
  const now = new Date();

  const meetings = await prisma.meeting.findMany({
    select: { id: true, title: true, startedAt: true, deletedAt: true },
  });
  const ids = meetings.map((m) => m.id);
  const [text, recordings, voiceprints] = await Promise.all([
    textUsage(ids),
    recordingSizes(ids),
    prisma.speakerProfile.findMany({ select: { embedding: true } }),
  ]);
  const byId = new Map(meetings.map((m) => [m.id, m]));
  const recorded = Object.entries(recordings ?? {}).filter(([id]) => byId.has(id));
  const count = (n: number) => n.toLocaleString("en-US");
  const recordingsLabel = (n: number) => t(n === 1 ? "1 recording" : "{n} recordings", { n: count(n) });

  // The recordings, by what becomes of them.
  const fates: Record<Fate, { bytes: number; n: number; last: Date | null }> = {
    protected: { bytes: 0, n: 0, last: null },
    kept: { bytes: 0, n: 0, last: null },
    expiring: { bytes: 0, n: 0, last: null },
    trash: { bytes: 0, n: 0, last: null },
  };
  let audioBytes = 0;
  let audioSeconds = 0;
  for (const [id, r] of recorded) {
    const m = byId.get(id)!;
    const fate = fateOf(r, m.deletedAt !== null);
    const f = fates[fate];
    f.bytes += r.audio;
    f.n += 1;
    // When the last of them goes: the retention sweep's deadline, or the trash's.
    const goes =
      fate === "expiring" && r.expiresAt
        ? new Date(r.expiresAt)
        : fate === "trash" && m.deletedAt
          ? new Date(m.deletedAt.getTime() + TRASH_PURGE_DAYS * 86_400_000)
          : null;
    if (goes && (!f.last || goes > f.last)) f.last = goes;
    audioBytes += r.audio;
    audioSeconds += r.seconds ?? 0;
  }
  const within = fates.expiring.last ? daysUntil(fates.expiring.last, now) : 1;
  const audioParts: Part[] = [
    { key: "protected", label: t("Protected — kept"), detail: recordingsLabel(fates.protected.n), bytes: fates.protected.bytes, color: FATE_COLOR.protected },
    // Only where the retention sweep is turned off: unprotected, and kept all the same.
    ...(fates.kept.n > 0
      ? [{ key: "kept", label: t("Not deleted automatically — kept"), detail: recordingsLabel(fates.kept.n), bytes: fates.kept.bytes, color: FATE_COLOR.kept }]
      : []),
    {
      key: "expiring",
      label: t(within === 1 ? "Deleted automatically within 1 day" : "Deleted automatically within {n} days", { n: within }),
      detail: recordingsLabel(fates.expiring.n),
      bytes: fates.expiring.bytes,
      color: FATE_COLOR.expiring,
    },
    {
      key: "trash",
      label: t("In the trash — deleted {n} days after it was put there", { n: TRASH_PURGE_DAYS }),
      detail: recordingsLabel(fates.trash.n),
      bytes: fates.trash.bytes,
      color: FATE_COLOR.trash,
    },
  ];
  const audioLength = formatDurationIn(locale, audioSeconds * 1000);

  const otherBytes =
    text.otherBytes +
    recorded.reduce((a, [, r]) => a + r.other, 0) +
    voiceprints.reduce((a, p) => a + Buffer.byteLength(p.embedding), 0);
  const textParts: Part[] = [
    {
      key: "transcripts",
      label: t("Transcripts"),
      detail: t(text.transcripts === 1 ? "1 utterance" : "{n} utterances", { n: count(text.transcripts) }),
      bytes: text.transcriptBytes,
      color: TEXT_COLOR.transcripts,
    },
    {
      key: "minutes",
      label: t("Minutes"),
      detail: t(text.minutes === 1 ? "1 set of minutes" : "{n} sets of minutes", { n: count(text.minutes) }),
      bytes: text.minutesBytes,
      color: TEXT_COLOR.minutes,
    },
    {
      key: "other",
      label: t("Other"),
      detail: t("Search index, speaker separation results and voiceprints"),
      bytes: otherBytes,
      color: TEXT_COLOR.other,
    },
  ];
  const textBytes = textParts.reduce((a, p) => a + p.bytes, 0);

  // Per hour of meeting, from this machine's own recordings, each in its own panel: why one is
  // in hundreds and the other in fractions.
  const audioPerHour = audioSeconds > 0 ? (audioBytes * 3600) / audioSeconds : null;
  const textPerHour = text.timedMs > 0 ? (text.timedTranscriptBytes * 3_600_000) / text.timedMs : null;

  // Every recording, largest first: the list is where they are protected or deleted now, so it
  // cannot stop at the top eight. The client shows the first ten and the rest on request.
  const largest = recorded.sort((a, b) => b[1].audio - a[1].audio);
  const biggest = largest[0]?.[1].audio ?? 0;
  const rows: RecordingRow[] = largest.map(([id, r]) => {
    const m = byId.get(id)!;
    const fate = fateOf(r, m.deletedAt !== null);
    const length = r.seconds ? formatDurationIn(locale, r.seconds * 1000) : null;
    return {
      id,
      title: m.title,
      when: `${formatDateTimeIn(locale, m.startedAt)}${length ? ` · ${length}` : ""}`,
      size: formatMB(r.audio),
      bar: biggest > 0 ? Math.max((r.audio / biggest) * 100, 1) : 0,
      color: FATE_COLOR[fate],
      fate,
      daysLeft: fate === "expiring" && r.expiresAt ? daysUntil(new Date(r.expiresAt), now) : null,
    };
  });

  return (
    <div data-paper className="mx-auto max-w-3xl space-y-6 pt-2 lg:pt-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-strong)]">{t("Storage")}</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          {t("The room your meeting material takes in Voxinq.")}{" "}
          {recordings ? (
            <span className="tabular-nums">{t("{size} in all.", { size: formatMB(audioBytes + textBytes) })}</span>
          ) : null}
        </p>
      </div>

      {recordings ? (
        <Panel
          title={t("Audio recordings")}
          total={formatMB(audioBytes)}
          sub={audioLength ? t("{length} in all", { length: audioLength }) : null}
          parts={audioParts}
        >
          {audioPerHour ? (
            <p className="text-xs text-[var(--text-muted)]">
              {t("About {size} per hour of meeting.", { size: formatMB(audioPerHour) })}
            </p>
          ) : null}
        </Panel>
      ) : (
        <section className="border-t border-[var(--border)] pt-5">
          <h2 className="text-sm font-semibold text-[var(--text-strong)]">{t("Audio recordings")}</h2>
          <p className="mt-2 text-sm text-[var(--warning)]">
            {t("The recordings could not be measured: the transcription service did not answer.")}
          </p>
        </section>
      )}

      <Panel title={t("Text")} total={formatMB(textBytes)} sub={null} parts={textParts}>
        {textPerHour ? (
          <p className="text-xs text-[var(--text-muted)]">
            {t("Transcripts take about {size} per hour of meeting.", { size: formatMB(textPerHour) })}
          </p>
        ) : null}
      </Panel>

      {rows.length > 0 ? (
        <section className="space-y-2 border-t border-[var(--border)] pt-5">
          <h2 className="text-sm font-semibold text-[var(--text-strong)]">{t("Recordings, largest first")}</h2>
          <RecordingList rows={rows} />
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
