import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatDateTime, formatDuration } from "@/lib/utils";
import { ArchiveButton } from "../[id]/archive-button";
import { ArchiveIcon } from "../icons";

export const dynamic = "force-dynamic";

// All archived meetings in one place (they are hidden from the main list but stay
// fully accessible: search finds them, and this page lists every one of them).
export default async function ArchivePage() {
  const meetings = await prisma.meeting.findMany({
    where: { deletedAt: null, archivedAt: { not: null } },
    orderBy: { archivedAt: "desc" },
    include: {
      _count: { select: { transcripts: true, summaries: true } },
      tags: { select: { name: true }, orderBy: { name: "asc" } },
      series: { select: { name: true } },
    },
  });

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
        via search. Unarchive to bring one back to the list.
      </p>

      {meetings.length === 0 ? (
        <p className="rounded-lg border border-dashed border-[var(--border-strong)] p-6 text-center text-sm text-[var(--text-muted)]">
          Nothing archived.
        </p>
      ) : (
        <ul className="space-y-2">
          {meetings.map((m) => (
            <li
              key={m.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3"
            >
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
                {m.tags.length > 0 || m.series ? (
                  <p className="mt-1 flex flex-wrap items-center gap-1">
                    {m.series ? (
                      <span className="rounded-full border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] px-1.5 py-0.5 text-[10px] text-[var(--accent-sub)]">
                        ↻ {m.series.name}
                      </span>
                    ) : null}
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
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
