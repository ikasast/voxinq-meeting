import Link from "next/link";
import { notFound } from "next/navigation";
import { isExternalRequest } from "@/lib/is-tailnet";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/utils";
import { MeetingListPane } from "../meeting-list-pane";
import { PageHeader } from "../page-header";
import { ArchiveButton } from "./archive-button";
import { CloneMeetingButton } from "./clone-meeting-button";
import { DeleteMeetingButton } from "./delete-meeting-button";
import { MeetingMeta } from "./meeting-meta";
import { MeetingTitle } from "./meeting-title";
import { SummarySection } from "./summary-section";
import { TranscriptList } from "./transcript-list";

export const dynamic = "force-dynamic";

export default async function MeetingDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string; tag?: string; period?: string }>;
}) {
  const { id } = await params;
  const { q, tag, period } = await searchParams;
  const meeting = await prisma.meeting.findUnique({
    where: { id },
    include: {
      transcripts: { orderBy: { createdAt: "asc" } },
      summaries: { orderBy: { createdAt: "desc" } },
      tags: { select: { name: true }, orderBy: { name: "asc" } },
    },
  });
  if (!meeting) notFound();

  const external = await isExternalRequest();
  const tagNames = meeting.tags.map((t) => t.name);

  // Desktop shows the meeting list on the left (2-pane); mobile shows the detail only and
  // goes back via "一覧へ戻る". The header is shared with the home page (so selecting a meeting
  // does not change the page skeleton).
  return (
    <div className="space-y-4">
      <div className="hidden lg:block">
        <PageHeader external={external} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(300px,360px)_1fr] lg:items-start">
      <aside className="hidden lg:block">
        <MeetingListPane q={q} tag={tag} period={period} activeId={meeting.id} />
      </aside>

      <div className="min-w-0 space-y-6">
      {/* Stack vertically on phones (so the title-edit box and action buttons are not crammed into one row) */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0 sm:flex-1">
          <MeetingTitle id={meeting.id} title={meeting.title} />
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            {formatDateTime(meeting.startedAt)}
            {meeting.endedAt ? <> – {formatDateTime(meeting.endedAt)}</> : <> – (in progress)</>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {/* Desktop can navigate via the left pane, so the back button is mobile-only */}
          <Link href="/" className="btn-outline lg:hidden">
            Back to list
          </Link>
          {!meeting.endedAt ? (
            <Link href={`/${meeting.id}/recording`} className="btn-ink">
              Recording screen
            </Link>
          ) : null}
          {!external ? (
            <CloneMeetingButton description={meeting.description} tags={tagNames} />
          ) : null}
          <ArchiveButton id={meeting.id} archived={meeting.archivedAt !== null} />
          <DeleteMeetingButton id={meeting.id} title={meeting.title} />
        </div>
      </div>

      {meeting.archivedAt ? (
        <div className="rounded-md border border-[var(--border-strong)] bg-[var(--elevated)] px-3 py-2 text-sm text-[var(--text-secondary)]">
          Archived — hidden from the meeting list, but still found via search.
        </div>
      ) : null}

      <MeetingMeta id={meeting.id} description={meeting.description} tags={tagNames} />

      <section className="card p-5">
        <SummarySection
          meetingId={meeting.id}
          meetingTitle={meeting.title}
          summaryStatus={meeting.summaryStatus}
          canGenerate={meeting.transcripts.length > 0}
          summaries={meeting.summaries.map((s) => ({
            id: s.id,
            text: s.summaryText,
            createdAt: s.createdAt.toISOString(),
          }))}
        />
      </section>

      <section className="card p-5">
        <TranscriptList
          meetingId={meeting.id}
          meetingTitle={meeting.title}
          meetingStartedAt={meeting.startedAt.toISOString()}
          initialSpeakerLabels={meeting.speakerLabels}
          initialTranscripts={meeting.transcripts.map((t) => ({
            id: t.id,
            speakerType: t.speakerType,
            text: t.text,
            createdAt: t.createdAt.toISOString(),
          }))}
        />
      </section>
      </div>
      </div>
    </div>
  );
}
