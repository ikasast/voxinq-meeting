import { extensionEnabled } from "@/lib/extensions-store";
import { notFound } from "next/navigation";
import { isExternalRequest } from "@/lib/is-tailnet";
import { prisma } from "@/lib/prisma";
import { getSttGlossary, getWhisperModel } from "@/lib/settings";
import { correctionTerms } from "@/lib/correction-terms";
import { minutesRunningFor } from "@/lib/meetings/minutes-state";
import { parseParams } from "@/lib/queue/types";
import { formatDateTimeIn, formatDurationIn } from "@/lib/i18n/format";
import { currentLocale, serverT } from "@/lib/i18n/server";
import { AskMinutes } from "../ask-minutes";
import { readExtensions } from "@/lib/extensions-store";
import { BookedTime } from "./booked-time";
import { DownloadMeetingButton } from "./download-meeting-button";
import { FirstRunGuide } from "./first-run-guide";
import { ResumeRecordingButton } from "./resume-recording-button";
import { MeetingFacts } from "./meeting-facts-card";
import { MeetingMenu } from "./meeting-menu";
import { ParticipantsRow } from "./participants-card";
import { SpeakersRow } from "./speakers-row";
import { readNames, separatedSpeakers } from "@/lib/speakers";
import { PROPS_GRID, Prop } from "./property";
import { MeetingMeta } from "./meeting-meta";
import { MeetingTitle } from "./meeting-title";
import { SummarySection } from "./summary-section";
import { TranscriptList } from "./transcript-list";
import { MeetingBody } from "./meeting-body";
import { RecordingDock } from "./recording-dock";

export const dynamic = "force-dynamic";

export default async function MeetingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ resume?: string }>;
}) {
  const { id } = await params;
  const { resume } = await searchParams;
  const locale = await currentLocale();
  const meeting = await prisma.meeting.findUnique({
    where: { id },
    include: {
      transcripts: { orderBy: { createdAt: "asc" } },
      summaries: { orderBy: { createdAt: "desc" } },
      series: {
        select: {
          id: true,
          name: true,
          sttGlossary: true,
          summaryFormat: true,
          members: { orderBy: [{ position: "asc" }], select: { name: true } },
        },
      },
      participants: {
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
        select: { name: true, speaking: true },
      },
    },
  });
  if (!meeting) notFound();

  // Whether minutes are on the way is the queue's to answer, not the meeting's: the two used to
  // be written down separately and drifted. See lib/meetings/minutes-state.ts.
  const minutesRunning = await minutesRunningFor(meeting.id);
  // Likewise a recognition on its way: a file dropped on New meeting, an import from the phone,
  // or a re-transcription that was started before this page was reloaded. Without asking, the
  // page would say "No transcript" and offer to restore one that is already being made.
  const transcribing = await prisma.job.findFirst({
    where: { kind: "transcribe", meetingId: meeting.id, status: { in: ["queued", "running"] } },
    select: { id: true, params: true },
  });
  // Whether the minutes follow on their own (a dropped file asks for that), so the minutes card
  // can say so instead of that there is nothing to write them from.
  const minutesAfter =
    transcribing !== null &&
    parseParams<{ thenMinutes?: boolean }>(transcribing.params).thenMinutes === true;

  const external = await isExternalRequest();
  const extensions = await readExtensions();
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
  const seriesName = meeting.series?.name ?? null;
  const seriesOn = await extensionEnabled("series");
  const seriesId = meeting.series?.id ?? null;

  const t = await serverT();
  const duration = formatDurationIn(locale, meeting.recordedMs);
  // This page is the recording screen (v4, design B) while the meeting has not ended — or when
  // "Resume recording" brought it back here (?resume=1), which reopens it. Not from outside:
  // the speech service is not reachable there.
  const recordHere = !external && (!meeting.endedAt || resume === "1");
  // The minutes' place on the page is taken by nothing while the meeting is still being
  // recorded and has none: "no minutes yet" says nothing anybody needs to read mid-meeting.
  const minutesShown = !recordHere || meeting.summaries.length > 0;

  // The meetings are in the sidebar (v4, design B), so the page is the meeting alone.
  return (
    <div className="space-y-4">
      <div>
      <div className="min-w-0 space-y-6">

      {/* The minutes are the document; what was said is the panel beside it (meeting-body.tsx). */}
      <MeetingBody
        meetingId={meeting.id}
        header={
          <>
      {/* The title, and what is done to the meeting as a whole: record into it, download it, and
          behind "…" the rest — start the next one like it, archive it, bin it. */}
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          {/* Editable from outside, like the agenda and the participants below: the point of
              booking a meeting from a work laptop is to name it and fill it in beforehand.
              `lib/external-writes.ts` allows exactly this PATCH; see there for what it does
              not allow. */}
          <MeetingTitle id={meeting.id} title={meeting.title} />
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
          {meeting.endedAt && !external && !recordHere ? (
            // Only rendered when the recording is still kept (the button checks STT).
            <ResumeRecordingButton meetingId={meeting.id} />
          ) : null}
          {/* External (read-only) access keeps only the download. */}
          <DownloadMeetingButton
            meetingId={meeting.id}
            title={meeting.title}
            hasMinutes={meeting.summaries.length > 0}
            hasTranscript={meeting.transcripts.length > 0}
          />
          {!external ? (
            <MeetingMenu
              id={meeting.id}
              title={meeting.title}
              series={seriesOn ? seriesName : null}
              pinned={meeting.pinnedAt !== null}
            />
          ) : null}
        </div>
      </div>

      {/* What the meeting is, as a table under its title (property.tsx): when, who, the series,
          the agenda — always in sight, no box around any of it — and, folded, what it was
          recorded and written with. Progress is a row only while something is under way; done,
          it is what the rest of the page already shows. */}
      <div className={PROPS_GRID}>
        <Prop label={t("When")}>
          {upcoming && meeting.scheduledAt && extensions.schedule ? (
            <BookedTime
              id={meeting.id}
              at={meeting.scheduledAt.toISOString()}
              label={formatDateTimeIn(locale, meeting.scheduledAt)}
            />
          ) : (
            formatDateTimeIn(locale, meeting.startedAt)
          )}
          {meeting.endedAt ? (
            <> – {formatDateTimeIn(locale, meeting.endedAt)}</>
          ) : upcoming ? (
            // Booked and not recorded yet: the date above is when it is due, and calling
            // that "in progress" would be the app telling you a meeting is happening.
            <> – {t("not recorded yet")}</>
          ) : (
            <> – {t("(in progress)")}</>
          )}
          {duration ? <span className="text-[var(--text-muted)]"> · {duration}</span> : null}
        </Prop>
        {transcribing || minutesRunning ? (
          <Prop label={t("Status")}>
            <span className="inline-flex items-center gap-2 text-[var(--accent-sub)]">
              <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-[var(--accent)]" />
              {[transcribing ? t("Transcribing…") : null, minutesRunning ? t("Writing minutes…") : null]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </Prop>
        ) : null}
        <ParticipantsRow
          meetingId={meeting.id}
          initial={meeting.participants}
          knownNames={knownSpeakers.map((p) => p.name)}
        />
        {/* Who spoke, under who was there: where speaker separation stands, and the way to it. */}
        {extensions.speakers && meeting.transcripts.length > 0 && !upcoming ? (
          <SpeakersRow
            meetingId={meeting.id}
            readOnly={external}
            initial={{
              ...separatedSpeakers(
                meeting.transcripts.map((l) => l.speakerType),
                readNames(meeting.speakerLabels),
                t,
              ),
              running: null,
              possible: true,
            }}
          />
        ) : null}
        <MeetingMeta
          id={meeting.id}
          description={meeting.description}
          series={seriesName}
          seriesId={seriesId}
        />
        {/* The recording: its row here, its dock at the bottom of the window. */}
        {recordHere ? <RecordingDock meetingId={meeting.id} external={external} /> : null}
        <MeetingFacts
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
      </div>
          </>
        }
        lineCount={meeting.transcripts.length}
        transcriptFirst={meeting.summaries.length === 0}
        document={
          <>

      {/* Only on the sample, and only from inside: it names buttons an external browser is not
          shown. Above the minutes because it is the reason somebody is on this page. */}
      {meeting.sample && !external ? (
        <FirstRunGuide recordingHref="/" />
      ) : null}

      {minutesShown ? (
      <section>
        <SummarySection
          meetingId={meeting.id}
          meetingTitle={meeting.title}
          minutesRunning={minutesRunning}
          lastOutcome={meeting.summaryStatus}
          summaryError={meeting.summaryError}
          canGenerate={meeting.transcripts.length > 0}
          minutesAfterTranscript={minutesAfter}
          readOnly={external}
          summaries={meeting.summaries.map((s) => ({
            id: s.id,
            text: s.summaryText,
            createdAt: s.createdAt.toISOString(),
          }))}
        />
      </section>
      ) : null}


          </>
        }
        transcript={
      <section>
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
          // Whether there is anything to check is one question with one answer, computed
          // where both this page and the route that runs the check can see it.
          hasCorrectionTerms={
            correctionTerms({
              globalGlossary: await getSttGlossary(),
              series: meeting.series
                ? {
                    name: meeting.series.name,
                    sttGlossary: meeting.series.sttGlossary,
                    members: meeting.series.members.map((m) => m.name),
                  }
                : null,
            }).length > 0
          }
          readOnly={external}
          transcribeJobId={external ? null : (transcribing?.id ?? null)}
          initialTranscripts={meeting.transcripts.map((line) => ({
            id: line.id,
            speakerType: line.speakerType,
            text: line.text,
            translation: line.translation,
            voice: line.voice,
            emotion: line.emotion,
            createdAt: line.createdAt.toISOString(),
            splitOfId: line.splitOfId,
          }))}
        />
      </section>
        }
      />
      {/* Room under the last line for the recording dock, which floats over the bottom of the
          window. */}
      {recordHere ? <div aria-hidden className="h-28" /> : null}
      {/* Asking about the meeting floats at the bottom right (ask-minutes.tsx). In a series the
          minutes it reads are the whole series', and this meeting's own words are the other
          choice; a one-off meeting is a series of one. */}
      {!external && extensions.ask && (meeting.summaries.length > 0 || meeting.transcripts.length > 0) ? (
        <AskMinutes
          seriesId={seriesId && seriesOn ? seriesId : undefined}
          meetingId={meeting.id}
          scopeLabel={seriesId && seriesOn && seriesName ? seriesName : meeting.title}
          hasMinutes={seriesId && seriesOn ? true : meeting.summaries.length > 0}
          // Recorded and not written up yet is exactly when the question is about what was
          // said, so it is offered then too — reading the meeting's own words.
          hasTranscript={meeting.transcripts.length > 0}
        />
      ) : null}
      </div>
      </div>
    </div>
  );
}
