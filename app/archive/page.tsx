import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatDateTime, formatDuration } from "@/lib/utils";
import { ArchiveButton } from "../[id]/archive-button";
import { ArchiveIcon } from "../icons";
import { SwipeableRow } from "../swipeable-row";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  title: string;
  startedAt: Date;
  endedAt: Date | null;
  archivedAt: Date | null;
  _count: { transcripts: number; summaries: number };
  tags: { name: string }[];
  series: { id: string; name: string } | null;
};

// All archived meetings in one place (they are hidden from the main list but stay
// fully accessible: search finds them, and this page lists every one of them).
// Meetings that belong to a series are grouped under that series, mirroring the
// stacked presentation of the main list.
export default async function ArchivePage() {
  const meetings: Row[] = await prisma.meeting.findMany({
    where: { deletedAt: null, archivedAt: { not: null } },
    orderBy: { archivedAt: "desc" },
    include: {
      _count: { select: { transcripts: true, summaries: true } },
      tags: { select: { name: true }, orderBy: { name: "asc" } },
      series: { select: { id: true, name: true } },
    },
  });

  // Group by series (keeping the archived-at order); standalone meetings keep their slot.
  type Group = { series: { id: string; name: string } | null; items: Row[] };
  const groups: Group[] = [];
  const bySeries = new Map<string, Group>();
  for (const m of meetings) {
    if (!m.series) {
      groups.push({ series: null, items: [m] });
      continue;
    }
    const existing = bySeries.get(m.series.id);
    if (existing) {
      existing.items.push(m);
    } else {
      const g: Group = { series: m.series, items: [m] };
      bySeries.set(m.series.id, g);
      groups.push(g);
    }
  }

  const row = (m: Row) => (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
      <div className="min-w-0 flex-1">
        <Link
          href={`/${m.id}`}
          className="block truncate text-sm font-medium text-[var(--text-strong)] hover:text-[var(--accent-sub)]"
        >
          {m.title}
        </Link>
        <p className="mt-0.5 text-xs text-[var(--text-muted)]">
          {formatDateTime(m.startedAt)}
          {formatDuration(m.startedAt, m.endedAt)
            ? ` · ${formatDuration(m.startedAt, m.endedAt)}`
            : ""}{" "}
          · {m._count.transcripts} utterances / {m._count.summaries} minutes · archived{" "}
          {formatDateTime(m.archivedAt)}
        </p>
        {m.tags.length > 0 ? (
          <p className="mt-1 flex flex-wrap items-center gap-1">
            {m.tags.map((t) => (
              <span
                key={t.name}
                className="rounded-full border border-[var(--border-strong)] px-1.5 py-0.5 text-[10px] text-[var(--text-secondary)]"
              >
                {t.name}
              </span>
            ))}
          </p>
        ) : null}
      </div>
      <ArchiveButton id={m.id} archived variant="text" />
    </div>
  );

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-[var(--text-strong)]">
          <ArchiveIcon className="h-5 w-5" />
          Archived meetings
        </h1>
        <Link href="/" className="btn-outline">
          Back to list
        </Link>
      </div>
      <p className="text-sm text-[var(--text-muted)]">
        Archived meetings are hidden from the main list but kept forever — open them here or
        via search. Unarchive to bring one back to the list. On a phone, swipe a row right to
        unarchive or left to move it to Trash.
      </p>

      {meetings.length === 0 ? (
        <p className="rounded-lg border border-dashed border-[var(--border-strong)] p-6 text-center text-sm text-[var(--text-muted)]">
          Nothing archived.
        </p>
      ) : (
        <ul className="space-y-3">
          {groups.map((g) =>
            g.series ? (
              <li key={g.series.id} className="rounded-xl border border-[var(--border)] p-2">
                <Link
                  href={`/series/${g.series.id}`}
                  className="mb-2 inline-flex items-center gap-1.5 px-1 text-xs text-[var(--accent-sub)] hover:underline"
                  title="Open the series page (timeline & defaults)"
                >
                  ↻ {g.series.name}
                  <span className="text-[var(--text-muted)]">({g.items.length})</span>
                </Link>
                <div className="space-y-2">
                  {g.items.map((m) => (
                    <SwipeableRow key={m.id} ids={[m.id]} label={m.title} archived>
                      {row(m)}
                    </SwipeableRow>
                  ))}
                </div>
              </li>
            ) : (
              <li key={g.items[0].id}>
                <SwipeableRow ids={[g.items[0].id]} label={g.items[0].title} archived>
                  {row(g.items[0])}
                </SwipeableRow>
              </li>
            ),
          )}
        </ul>
      )}
    </div>
  );
}
