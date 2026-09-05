import Link from "next/link";
import { notFound } from "next/navigation";
import { isExternalRequest } from "@/lib/is-tailnet";
import { prisma } from "@/lib/prisma";
import { getSttGlossary, getWhisperModel } from "@/lib/settings";
import { formatDateTime } from "@/lib/utils";
import { AskMinutes } from "../ask-minutes";
import { MeetingListPane } from "../meeting-list-pane";
import { PageHeader } from "../page-header";
import { ArchiveButton } from "./archive-button";
import { CloneMeetingButton } from "./clone-meeting-button";
import { DeleteMeetingButton } from "./delete-meeting-button";
import { DownloadMeetingButton } from "./download-meeting-button";
import { ResumeRecordingButton } from "./resume-recording-button";
import { MeetingFactsCard } from "./meeting-facts-card";
import { ParticipantsCard } from "./participants-card";
import { ProgressCard } from "./progress-card";
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
  searchParams: Promise<{ q?: string; tag?: string; series?: string; date?: string; month?: string }>;
}) {
  const { id } = await params;
  const { q, tag, series, date, month } = await searchParams;
  const meeting = await prisma.meeting.findUnique({
    where: { id },
    include: {
      transcripts: { orderBy: { createdAt: "asc" } },
      summaries: { orderBy: { createdAt: "desc" } },
      tags: { select: { name: true }, orderBy: { name: "asc" } },
      series: { select: { id: true, name: true, sttGlossary: true, summaryFormat: true } },
      participants: {
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
        select: { name: true, speaking: true },
      },
    },
  });
  if (!meeting) notFound();

  const external = await isExternalRequest();
  // Enrolled voice profiles, offered as suggestions when typing a participant. A name that
  // matches one becomes a candidate for automatic naming; one that does not is still fine.
  const knownSpeakers = await prisma.speakerProfile.findMany({
    orderBy: { name: "asc" },
    select: { name: true },
  });
  // Booked ahead and nothing said into it yet. Once it has a transcript or an end time it is
  // an ordinary meeting, whatever the diary said.
  const upcoming =
    meeting.scheduledAt !== null && meeting.endedAt === null && meeting.transcripts.length === 0;
  const tagNames = meeting.tags.map((t) => t.name);
  const seriesName = meeting.series?.name ?? null;
  const seriesId = meeting.series?.id ?? null;

  // Desktop shows the meeting list on the left (2-pane); mobile shows the detail only and
  // goes back via "一覧へ戻る". The header is shared with the home page (so selecting a meeting
  // does not change the page skeleton).
  return (
    <div className="space-y-4">
      <div className="hidden lg:block">
        <PageHeader external={external} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(300px,400px)_1fr] lg:items-start">
      <aside className="hidden lg:block">
        <MeetingListPane
          q={q}
          tag={tag}
          series={series}
          date={date}
          month={month}
          activeId={meeting.id}
          readOnly={external}
        />
      </aside>

      <div className="min-w-0 space-y-6">
      {/* Stack vertically on phones (so the title-edit box and action buttons are not crammed into one row) */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0 sm:flex-1">
          <MeetingTitle id={meeting.id} title={meeting.title} readOnly={external} />
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            {formatDateTime(meeting.startedAt)}
            {meeting.endedAt ? (
              <> – {formatDateTime(meeting.endedAt)}</>
            ) : upcoming ? (
              // Booked and not recorded yet: the date above is when it is due, and calling
              // that "in progress" would be the app telling you a meeting is happening.
              <> – not recorded yet</>
            ) : (
              <> – (in progress)</>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Desktop can navigate via the left pane, so the back button is mobile-only */}
          <Link href="/" className="btn-outline lg:hidden">
            Back to list
          </Link>
          {!meeting.endedAt && !external ? (
            <Link href={`/${meeting.id}/recording`} className="btn-ink">
              Recording screen
            </Link>
          ) : null}
          {meeting.endedAt && !external ? (
            // Only rendered when the recording is still kept (the button checks STT).
            <ResumeRecordingButton meetingId={meeting.id} />
          ) : null}
          {/* Compact icon toolbar (hover for what each does).
              External (read-only) access keeps only the download button. */}
          <div className="flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-1">
            <DownloadMeetingButton
              meetingId={meeting.id}
              title={meeting.title}
              hasMinutes={meeting.summaries.length > 0}
              hasTranscript={meeting.transcripts.length > 0}
            />
            {!external ? (
              <>
                <CloneMeetingButton
                  description={meeting.description}
                  tags={tagNames}
                  series={seriesName}
                />
                <ArchiveButton id={meeting.id} archived={meeting.archivedAt !== null} />
                <DeleteMeetingButton id={meeting.id} title={meeting.title} />
              </>
            ) : null}
          </div>
        </div>
      </div>

      {meeting.archivedAt ? (
        <div className="rounded-md border border-[var(--border-strong)] bg-[var(--elevated)] px-3 py-2 text-sm text-[var(--text-secondary)]">
          Archived — hidden from the meeting list, but still found via search.
        </div>
      ) : null}

      <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_minmax(260px,340px)] 2xl:items-start">
      <div className="min-w-0 space-y-6">

      <section className="card p-5">
        <SummarySection
          meetingId={meeting.id}
          meetingTitle={meeting.title}
          summaryStatus={meeting.summaryStatus}
          summaryError={meeting.summaryError}
          canGenerate={meeting.transcripts.length > 0}
          readOnly={external}
          summaries={meeting.summaries.map((s) => ({
            id: s.id,
            text: s.summaryText,
            createdAt: s.createdAt.toISOString(),
          }))}
        />
      </section>

      {/* A meeting outside a series is its own scope for questions — a one-off is a series of
          one. Meetings in a series are asked about on the series page, where the whole history
          is available, so no box here. */}
      {!external && !seriesId && meeting.summaries.length > 0 ? (
        <AskMinutes meetingId={meeting.id} scopeLabel={meeting.title} />
      ) : null}

      <section className="card p-5">
        <TranscriptList
          meetingId={meeting.id}
          meetingTitle={meeting.title}
          meetingStartedAt={meeting.startedAt.toISOString()}
          // null means the meeting is still being recorded somewhere: the transcript then
          // follows along by polling instead of staying at this server-rendered snapshot.
          meetingEndedAt={meeting.endedAt?.toISOString() ?? null}
          upcoming={upcoming}
          initialSpeakerLabels={meeting.speakerLabels}
          seriesGlossary={meeting.series?.sttGlossary ?? null}
          globalGlossary={await getSttGlossary()}
          readOnly={external}
          initialTranscripts={meeting.transcripts.map((t) => ({
            id: t.id,
            speakerType: t.speakerType,
            text: t.text,
            translation: t.translation,
            createdAt: t.createdAt.toISOString(),
          }))}
        />
      </section>
      </div>

      {/* What the meeting *is*, beside what it produced: agenda and tags, the settings it was
          actually recorded and written with, the series it belongs to, and who was there.
          A rail on wide screens; above the minutes on anything narrower, because on a phone
          this is context you read first and then scroll past. */}
      <aside className="order-first space-y-4 2xl:order-none">
        <ProgressCard
          ended={meeting.endedAt !== null}
          recordedMs={meeting.recordedMs}
          transcriptCount={meeting.transcripts.length}
          separated={meeting.diarizationEmbeddings !== null}
          speakerCount={new Set(meeting.transcripts.map((t) => t.speakerType)).size}
          summaryCount={meeting.summaries.length}
          summaryStatus={meeting.summaryStatus}
        />
        <MeetingMeta
          id={meeting.id}
          description={meeting.description}
          tags={tagNames}
          series={seriesName}
          seriesId={seriesId}
          readOnly={external}
        />
        <ParticipantsCard
          meetingId={meeting.id}
          initial={meeting.participants}
          knownNames={knownSpeakers.map((p) => p.name)}
          readOnly={external}
        />
        <MeetingFactsCard
          whisperModel={meeting.whisperModel}
          sttLanguage={meeting.sttLanguage}
          defaultWhisperModel={await getWhisperModel()}
          series={
            meeting.series
              ? {
                  id: meeting.series.id,
                  name: meeting.series.name,
                  summaryFormat: meeting.series.summaryFormat,
                  glossary: meeting.series.sttGlossary,
                }
              : null
          }
          latestSummary={
            meeting.summaries[0]
              ? { provider: meeting.summaries[0].provider, model: meeting.summaries[0].model }
              : null
          }
        />
      </aside>
      </div>
      </div>
      </div>
    </div>
  );
}
