import Link from "next/link";
import { notFound } from "next/navigation";
import { isExternalRequest } from "@/lib/is-tailnet";
import { formatDateTimeIn, formatDurationIn } from "@/lib/i18n/format";
import { currentLocale, serverT } from "@/lib/i18n/server";
import { prisma } from "@/lib/prisma";
import { extensionEnabled } from "@/lib/extensions-store";
import { AskMinutes } from "../../ask-minutes";
import { SeriesSettings } from "./series-settings";
import { DeleteSeriesButton } from "./delete-series-button";
import { CalendarPlusIcon, SeriesIcon } from "../../icons";
import { PROPS_GRID, Prop } from "../../[id]/property";

export const dynamic = "force-dynamic";

// The lead section of a minutes document: everything from the first "## " heading up to
// the next one (typically the overview), as plain text — the row shows two lines of it, and
// "###" or "- " at the start of them is markup, not content.
function plainLead(minutes: string, maxChars = 300): string {
  const text = minutes.trim();
  const m = text.match(/^##\s[^\n]*\n([\s\S]*?)(?=\n##\s|$)/m);
  const lead = (m ? m[1] : text)
    .split("\n")
    .map((l) => l.replace(/^\s*(#{1,6}\s+|[-*+]\s+|\d+\.\s+)/, "").replace(/\*\*/g, "").trim())
    .filter(Boolean)
    .join(" ");
  return lead.length > maxChars ? `${lead.slice(0, maxChars)}…` : lead;
}

// Series page (v4): its details as a table under its title, like a meeting's — the regular
// members, the shared background, the format and the glossary — and its meetings as rows,
// newest first, each with the opening of its latest minutes.
export default async function SeriesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  /** `edit=1` arrives from New series, where the name is all that exists yet. */
  searchParams: Promise<{ edit?: string }>;
}) {
  // Not there at all while Series is switched off.
  if (!(await extensionEnabled("series"))) notFound();
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
      _count: { select: { transcripts: true, summaries: true } },
      summaries: { orderBy: { createdAt: "desc" }, take: 1, select: { summaryText: true } },
    },
  });

  // Who could be a regular: anybody with an enrolled voice — the names a meeting's participant
  // list offers — and anybody who has already been at one of this series' meetings.
  const [profiles, attended] = await Promise.all([
    prisma.speakerProfile.findMany({ orderBy: { name: "asc" }, select: { name: true } }),
    prisma.meetingParticipant.findMany({
      where: { meeting: { seriesId: id, deletedAt: null } },
      orderBy: { name: "asc" },
      distinct: ["name"],
      select: { name: true },
    }),
  ]);
  const knownNames = [...new Set([...profiles, ...attended].map((p) => p.name))];

  return (
    <div data-paper className="mx-auto max-w-[50rem] space-y-6 pt-2 lg:pt-6">
      {/* The title, and the next meeting in it — now, or booked for later. */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <h1 className="flex min-w-0 flex-1 items-center gap-2 text-2xl font-semibold tracking-tight text-[var(--text-strong)]">
          <SeriesIcon className="h-6 w-6 shrink-0 text-[var(--accent-sub)]" />
          <span className="min-w-0 break-words">{series.name}</span>
        </h1>
        <div className="flex shrink-0 items-center gap-1">
          <Link href={`/new?series=${encodeURIComponent(series.name)}`} className="btn-ink">
            <CalendarPlusIcon className="h-4 w-4" />
            {t("Next meeting")}
          </Link>
          {/* Only while nothing is filed under it, and only from inside: deleting is not setting up. */}
          {series._count.meetings === 0 && !external ? <DeleteSeriesButton id={series.id} name={series.name} /> : null}
        </div>
      </div>

      {/* What the series is, as a table under its title — the same one a meeting's page has. */}
      <div className={PROPS_GRID}>
        <Prop label={t("Meetings")}>
          {t(meetings.length === 1 ? "1 meeting" : "{n} meetings", { n: meetings.length })}
          <span className="text-[var(--text-muted)]"> · {t("each meeting's minutes are written with the previous one's")}</span>
        </Prop>
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
          knownNames={knownNames}
        />
      </div>

      {/* Its meetings, newest first, as rows like the meeting list's — each with the opening of
          its latest minutes, so the series reads as a story without opening every one. */}
      <section>
        <h2 className="mb-1 text-sm font-semibold text-[var(--text-secondary)]">{t("Meetings")}</h2>
        {meetings.length === 0 ? (
          <p className="border-y border-[var(--border)] py-6 text-sm text-[var(--text-muted)]">
            {t("No meetings in this series yet.")}
          </p>
        ) : (
          <ul className="border-t border-[var(--border)]">
            {meetings.map((m) => (
              <li key={m.id} className="border-b border-[var(--border)]">
                <Link href={`/${m.id}`} className="block px-2 py-2.5 hover:bg-[var(--panel)]">
                  <span className="flex items-baseline gap-2">
                    <span className="min-w-0 truncate text-sm font-medium text-[var(--text-strong)]">{m.title}</span>
                    {m.summaries[0] ? null : m._count.transcripts > 0 && m.endedAt ? (
                      <span className="tag-warn shrink-0">{t("No minutes")}</span>
                    ) : null}
                    <span className="ml-auto shrink-0 text-xs tabular-nums text-[var(--text-muted)]">
                      {formatDateTimeIn(locale, m.startedAt)}
                      {m.endedAt ? ` · ${formatDurationIn(locale, m.endedAt.getTime() - m.startedAt.getTime()) ?? ""}` : ""}
                    </span>
                  </span>
                  {m.summaries[0] ? (
                    <span className="mt-0.5 line-clamp-2 text-xs text-[var(--text-secondary)]">
                      {plainLead(m.summaries[0].summaryText)}
                    </span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Questions span the whole series ("what were the TODOs from last time?"): the button at
          the bottom right reads all of its minutes. Hidden for external (read-only) viewers:
          answering runs the local LLM on the GPU. */}
      {!external && (await extensionEnabled("ask")) ? (
        <AskMinutes seriesId={series.id} scopeLabel={series.name} />
      ) : null}
    </div>
  );
}
