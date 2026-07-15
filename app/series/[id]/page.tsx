import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatDateTime, formatDuration } from "@/lib/utils";
import { SeriesSettings } from "./series-settings";

export const dynamic = "force-dynamic";

// The lead section of a minutes document: everything from the first "## " heading up to
// the next one (typically the overview). Falls back to the head of the text.
function leadSection(minutes: string, maxChars = 700): string {
  const text = minutes.trim();
  const m = text.match(/^##\s[^\n]*\n([\s\S]*?)(?=\n##\s|$)/m);
  const lead = (m ? m[1] : text).trim();
  return lead.length > maxChars ? `${lead.slice(0, maxChars)}…` : lead;
}

// Series page: per-series defaults + a chronological "story" of the series — each
// meeting with the overview section of its latest minutes, newest first.
export default async function SeriesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const series = await prisma.series.findUnique({
    where: { id },
    select: { id: true, name: true, summaryFormat: true, sttGlossary: true },
  });
  if (!series) notFound();

  const meetings = await prisma.meeting.findMany({
    where: { seriesId: id, deletedAt: null },
    orderBy: { startedAt: "desc" },
    select: {
      id: true,
      title: true,
      startedAt: true,
      endedAt: true,
      archivedAt: true,
      _count: { select: { transcripts: true, summaries: true } },
      summaries: { orderBy: { createdAt: "desc" }, take: 1, select: { summaryText: true } },
    },
  });

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-strong)]">
          ↻ {series.name}
        </h1>
        <Link href="/" className="btn-outline">
          Back to list
        </Link>
      </div>
      <p className="text-sm text-[var(--text-muted)]">
        {meetings.length} meeting(s) in this series. When minutes are generated, the previous
        meeting&apos;s minutes are passed to the LLM as context.
      </p>

      <SeriesSettings
        id={series.id}
        name={series.name}
        summaryFormat={series.summaryFormat}
        sttGlossary={series.sttGlossary}
      />

      {/* Timeline: newest first, each entry shows the overview of its latest minutes */}
      <section className="space-y-0">
        {meetings.map((m, i) => (
          <div key={m.id} className="relative pb-6 pl-6">
            {/* timeline rail */}
            {i < meetings.length - 1 ? (
              <span
                aria-hidden
                className="absolute left-[5px] top-3 h-full w-px bg-[var(--border-strong)]"
              />
            ) : null}
            <span
              aria-hidden
              className="absolute left-0 top-2 h-[11px] w-[11px] rounded-full border-2 border-[var(--accent)] bg-[var(--background)]"
            />
            <p className="text-xs text-[var(--text-muted)]">
              {formatDateTime(m.startedAt)}
              {formatDuration(m.startedAt, m.endedAt)
                ? ` · ${formatDuration(m.startedAt, m.endedAt)}`
                : ""}
              {m.archivedAt ? " · archived" : ""}
            </p>
            <Link
              href={`/${m.id}`}
              className="text-sm font-medium text-[var(--text-strong)] hover:text-[var(--accent-sub)]"
            >
              {m.title}
            </Link>
            {m.summaries[0] ? (
              <div className="mt-2 whitespace-pre-wrap rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 text-xs leading-relaxed text-[var(--text-secondary)]">
                {leadSection(m.summaries[0].summaryText)}
              </div>
            ) : (
              <p className="mt-2 text-xs text-[var(--text-muted)]">
                No minutes yet ({m._count.transcripts} utterances).
              </p>
            )}
          </div>
        ))}
        {meetings.length === 0 ? (
          <p className="rounded-lg border border-dashed border-[var(--border-strong)] p-6 text-center text-sm text-[var(--text-muted)]">
            No meetings in this series yet.
          </p>
        ) : null}
      </section>
    </div>
  );
}
