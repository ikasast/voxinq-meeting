import Link from "next/link";
import { notFound } from "next/navigation";
import { isExternalRequest } from "@/lib/is-tailnet";
import { formatDateTimeIn, formatDurationIn } from "@/lib/i18n/format";
import { currentLocale, serverT } from "@/lib/i18n/server";
import { prisma } from "@/lib/prisma";
import { AskMinutes } from "../../ask-minutes";
import { SeriesSettings } from "./series-settings";
import { DeleteSeriesButton } from "./delete-series-button";
import { SeriesIcon } from "../../icons";

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
export default async function SeriesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  /** `edit=1` arrives from New series, where the name is all that exists yet. */
  searchParams: Promise<{ edit?: string }>;
}) {
  const { id } = await params;
  const { edit } = await searchParams;
  const series = await prisma.series.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      summaryFormat: true,
      sttGlossary: true,
      description: true,
      members: { orderBy: [{ position: "asc" }, { createdAt: "asc" }], select: { name: true } },
      // Everybody's, trashed included: a `_count` is not narrowed by the scoped client. Decides
      // whether Delete is offered, with the same answer the route will give.
      _count: { select: { meetings: true } },
    },
  });
  if (!series) notFound();

  const external = await isExternalRequest();
  const t = await serverT();
  const locale = await currentLocale();
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
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-[var(--text-strong)]">
          <SeriesIcon className="h-6 w-6 shrink-0 text-[var(--accent-sub)]" />
          {series.name}
        </h1>
        <Link href="/" className="btn-outline">
          {t("Back to list")}
        </Link>
      </div>
      <p className="text-sm text-[var(--text-muted)]">
        {t(
          meetings.length === 1
            ? "1 meeting in this series. When minutes are generated, the previous meeting’s minutes are passed to the LLM as context."
            : "{n} meetings in this series. When minutes are generated, the previous meeting’s minutes are passed to the LLM as context.",
          { n: meetings.length },
        )}
      </p>

      {/* Questions span the whole series ("what were the TODOs from last time?"), so this
          belongs here rather than on any single meeting. Hidden for external (read-only)
          viewers: answering runs the local LLM on the GPU. */}
      {!external ? <AskMinutes seriesId={series.id} scopeLabel={series.name} /> : null}

      <SeriesSettings
        id={series.id}
        name={series.name}
        summaryFormat={series.summaryFormat}
        sttGlossary={series.sttGlossary}
        description={series.description}
        members={series.members.map((m) => m.name)}
        // Editable from outside, like a meeting's agenda: it is what the next meeting in the
        // series is set up from. `lib/external-writes.ts` allows exactly this PATCH.
        startEditing={edit === "1"}
      />

      {/* Only while nothing is filed under it, and only from inside: deleting is not setting up. */}
      {series._count.meetings === 0 && !external ? (
        <DeleteSeriesButton id={series.id} name={series.name} />
      ) : null}

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
              {formatDateTimeIn(locale, m.startedAt)}
              {m.endedAt
                ? ` · ${formatDurationIn(locale, m.endedAt.getTime() - m.startedAt.getTime()) ?? ""}`
                : ""}
              {m.archivedAt ? ` · ${t("Archived")}` : ""}
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
                {t("No minutes yet ({n}).", {
                  n: t(m._count.transcripts === 1 ? "1 utterance" : "{n} utterances", {
                    n: m._count.transcripts,
                  }),
                })}
              </p>
            )}
          </div>
        ))}
        {meetings.length === 0 ? (
          <p className="rounded-lg border border-dashed border-[var(--border-strong)] p-6 text-center text-sm text-[var(--text-muted)]">
            {t("No meetings in this series yet.")}
          </p>
        ) : null}
      </section>
    </div>
  );
}
