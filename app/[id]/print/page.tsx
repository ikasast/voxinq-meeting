import Link from "next/link";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { prisma } from "@/lib/prisma";
import { formatDateTime, formatDuration } from "@/lib/utils";
import { PrintTrigger } from "./print-trigger";

export const dynamic = "force-dynamic";

// A print-shaped view of the minutes, and the app's answer to "export as PDF".
//
// The alternative — rendering PDF on the server — would mean embedding a Japanese font, since a
// PDF carries its own. That is 5.4 MB the project deliberately does not ship (see
// docs/design-decisions.md on fonts). The browser already has those fonts and already has a
// PDF writer, so printing from here produces better Japanese output than we could, for no
// dependency and no bundle cost.
export default async function PrintMinutes({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const meeting = await prisma.meeting.findUnique({
    where: { id },
    include: {
      summaries: { orderBy: { createdAt: "desc" }, take: 1 },
      series: { select: { name: true } },
      tags: { select: { name: true }, orderBy: { name: "asc" } },
    },
  });
  if (!meeting) notFound();

  const minutes = meeting.summaries[0];
  const duration = formatDuration(meeting.startedAt, meeting.endedAt);

  return (
    <main className="print-sheet mx-auto max-w-3xl px-6 py-8">
      {/* Everything in here is hidden when printing — see globals.css. */}
      <div className="no-print mb-6 flex flex-wrap items-center gap-3">
        <PrintTrigger />
        <Link href={`/${meeting.id}`} className="btn-outline">
          Back to the meeting
        </Link>
        <span className="text-xs text-[var(--text-muted)]">
          Choose “Save as PDF” as the destination to keep a copy.
        </span>
      </div>

      <header className="mb-6 border-b border-[var(--border)] pb-4">
        <h1 className="text-2xl font-semibold text-[var(--text-strong)]">{meeting.title}</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          {formatDateTime(meeting.startedAt)}
          {meeting.endedAt ? ` – ${formatDateTime(meeting.endedAt)}` : ""}
          {duration ? ` (${duration})` : ""}
          {meeting.series ? `  ·  ${meeting.series.name}` : ""}
        </p>
        {meeting.tags.length > 0 ? (
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            {meeting.tags.map((t) => t.name).join(", ")}
          </p>
        ) : null}
      </header>

      {minutes ? (
        <article className="prose prose-invert minutes-prose max-w-none prose-headings:font-semibold">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{minutes.summaryText}</ReactMarkdown>
        </article>
      ) : (
        <p className="text-sm text-[var(--text-muted)]">
          No minutes have been generated for this meeting yet.
        </p>
      )}

      <footer className="mt-10 text-right text-[10px] text-[var(--text-muted)]">
        Exported from Voxinq Meeting on {formatDateTime(new Date())}
      </footer>
    </main>
  );
}
