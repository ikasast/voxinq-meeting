import Link from "next/link";
import type { ReactNode } from "react";
import { prisma } from "@/lib/prisma";
import { bandOf } from "@/lib/meeting-bands";
import { buildMeetingWhere, makeSnippet } from "@/lib/meeting-filter";
import { formatDateTime, formatDurationMs } from "@/lib/utils";
import { MinutesWatcher } from "./minutes-watcher";
import { ArchiveIcon, TrashIcon } from "./icons";
import { MeetingItemMenu } from "./meeting-item-menu";
import { LiveStatus } from "./live-status";
import { RecordingBadges } from "./recording-badges";
import { SwipeableRow } from "./swipeable-row";
import { TagFilter } from "./tag-filter";

type MeetingCardData = {
  id: string;
  title: string;
  startedAt: Date;
  endedAt: Date | null;
  archivedAt: Date | null;
  // Actual recording length (ms): the stored recorded_ms, else the transcript time span.
  durationMs: number | null;
  summaryStatus: string | null;
  /** Booked ahead and not recorded yet. Shown above the rest, soonest first. */
  upcoming?: boolean;
  seriesName: string | null;
  seriesId: string | null;
  tags: { name: string }[];
  _count: { transcripts: number; summaries: number };
};

// Left side of the 2-pane UI: meeting list with search/tag filters.
// Used by both the home page and the meeting detail page (activeId highlights the selected one).
export async function MeetingListPane({
  q,
  tag,
  series,
  activeId,
  readOnly = false,
}: {
  q?: string;
  tag?: string;
  series?: string;
  activeId?: string;
  // External (read-only) access: no swipe actions or per-card ⋯ menu, no Trash link.
  readOnly?: boolean;
}) {
  const query = (q ?? "").trim();
  const activeTag = (tag ?? "").trim();
  const activeSeries = (series ?? "").trim();

  // An async server component renders once per request, so this is the request's own time —
  // not something that can shift under a re-render. Read once so every row is banded against
  // the same instant.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();

  const where = buildMeetingWhere({ query, tag: activeTag, series: activeSeries });

  const [meetingsRaw, allTags] = await Promise.all([
    prisma.meeting.findMany({
      where,
      // Upcoming meetings sort by when they are due, ascending, and are separated out below;
      // everything else stays newest-first. Both come from one query so the take applies once.
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        _count: { select: { transcripts: true, summaries: true } },
        tags: { select: { name: true }, orderBy: { name: "asc" } },
        series: { select: { id: true, name: true } },
      },
    }),
    // Tag filter mirrors the list: archived meetings are hidden there, so a tag whose
    // meetings are all archived must not appear (clicking it would show zero results).
    prisma.tag.findMany({
      where: { meetings: { some: { deletedAt: null, archivedAt: null } } },
      orderBy: { name: "asc" },
      include: {
        _count: { select: { meetings: { where: { deletedAt: null, archivedAt: null } } } },
      },
    }),
  ]);
  // Actual recording time: prefer the stored recorded length; for meetings recorded before
  // that was captured, fall back to the transcript time span (first -> last utterance).
  const ids = meetingsRaw.map((m) => m.id);
  const spans = ids.length
    ? await prisma.transcript.groupBy({
        by: ["meetingId"],
        where: { meetingId: { in: ids } },
        _min: { createdAt: true },
        _max: { createdAt: true },
      })
    : [];
  const spanMs = new Map(
    spans.map((s) => [
      s.meetingId,
      s._max.createdAt && s._min.createdAt
        ? s._max.createdAt.getTime() - s._min.createdAt.getTime()
        : 0,
    ]),
  );

  // "Upcoming" is a meeting that has been put in the diary and not recorded yet. Once anything
  // has been said into it, or it has been ended, it is an ordinary meeting whatever the diary
  // said -- so a booking somebody forgot to record does not sit at the top of the list forever
  // once it is used.
  const meetings: MeetingCardData[] = meetingsRaw.map((m) => ({
    ...m,
    seriesName: m.series?.name ?? null,
    seriesId: m.series?.id ?? null,
    durationMs: m.recordedMs ?? spanMs.get(m.id) ?? null,
    upcoming: m.scheduledAt !== null && m.endedAt === null && m._count.transcripts === 0,
  }));

  // On search: find where it matched + a snippet.
  const matched = new Map<string, { fields: string[]; snippet: string | null }>();
  if (query && meetings.length > 0) {
    const ids = meetings.map((m) => m.id);
    const [transcriptHits, summaryHits] = await Promise.all([
      prisma.transcript.findMany({
        where: { meetingId: { in: ids }, text: { contains: query, mode: "insensitive" } },
        select: { meetingId: true, text: true },
        distinct: ["meetingId"],
      }),
      prisma.meetingSummary.findMany({
        where: { meetingId: { in: ids }, summaryText: { contains: query, mode: "insensitive" } },
        select: { meetingId: true, summaryText: true },
        distinct: ["meetingId"],
      }),
    ]);
    const trMap = new Map(transcriptHits.map((h) => [h.meetingId, h.text]));
    const smMap = new Map(summaryHits.map((h) => [h.meetingId, h.summaryText]));
    const descByMeeting = new Map(meetingsRaw.map((m) => [m.id, m.description ?? ""]));
    for (const m of meetings) {
      const fields: string[] = [];
      let snippet: string | null = null;
      const needle = query.toLowerCase();
      if (m.title.toLowerCase().includes(needle)) fields.push("title");
      const desc = descByMeeting.get(m.id) ?? "";
      if (desc.toLowerCase().includes(needle)) {
        fields.push("purpose");
        snippet ??= makeSnippet(desc, query);
      }
      if (trMap.has(m.id)) {
        fields.push("transcript");
        snippet ??= makeSnippet(trMap.get(m.id)!, query);
      }
      if (smMap.has(m.id)) {
        fields.push("minutes");
        snippet ??= makeSnippet(smMap.get(m.id)!, query);
      }
      matched.set(m.id, { fields, snippet });
    }
  }

  // The meeting currently generating minutes (first-time OR regeneration), if any — used to
  // seed the live watcher so it only refreshes the list when that changes.
  const generatingId = meetings.find((m) => m.summaryStatus === "processing")?.id ?? "";
  const filtering = Boolean(query || activeTag || activeSeries);
  const base = activeId ? `/${activeId}` : "/";

  // Query string representing the current filters ("?..." or ""). overrides replaces individual parts.
  const queryString = (over: { tag?: string | null; series?: string | null } = {}) => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    const t = "tag" in over ? over.tag : activeTag;
    if (t) params.set("tag", t);
    const sr = "series" in over ? over.series : activeSeries;
    if (sr) params.set("series", sr);
    const s = params.toString();
    return s ? `?${s}` : "";
  };
  const hrefWith = (over: { tag?: string | null; series?: string | null }) =>
    `${base}${queryString(over)}`;

  // The card is a link, and the badges under it are not part of it: the series chip filters
  // the list rather than opening the meeting, and a link inside a link is invalid HTML. So the
  // border and the padding belong to the wrapper, and the meeting link covers only the part
  // that opens the meeting.
  const card = (m: MeetingCardData) => {
    const active = m.id === activeId;
    const showSeriesChip = Boolean(m.seriesName) && m.seriesName !== activeSeries;
    const hit = matched.get(m.id);
    return (
      <div
        className={`group relative rounded-lg border p-3 transition ${
          active
            ? "border-[var(--accent)] bg-[var(--elevated)]"
            : "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--accent)]"
        }`}
      >
        <Link
          href={`/${m.id}${queryString()}`}
          aria-current={active ? "page" : undefined}
          className="block"
        >
          <div className="flex items-center justify-between gap-2 pr-6">
            <span className="truncate text-sm font-medium text-[var(--text-strong)]">
              {m.title}
            </span>
            {m.archivedAt ? (
              <span
                className="shrink-0 text-[var(--text-muted)]"
                title="Archived — hidden from the list, still searchable"
              >
                <ArchiveIcon className="h-3.5 w-3.5" />
              </span>
            ) : null}
            {/* Status pill. Baseline is server-rendered (minutes generation / open session);
                LiveStatus refines it from STT to Recording…/Transcribing…/Diarizing…/Waiting…. */}
            {(() => {
              const base =
                m.summaryStatus === "processing"
                  ? "Generating minutes…"
                  : m.endedAt
                    ? ""
                    : m.upcoming
                      ? "Upcoming"
                      : "In progress";
              return (
                <span
                  data-live-status={m.id}
                  data-live-open={m.endedAt || m.upcoming ? "" : "1"}
                  data-live-base={base}
                  className={base ? "tag-lime shrink-0" : "hidden"}
                >
                  {base}
                </span>
              );
            })()}
          </div>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            {formatDateTime(m.startedAt)}
            {formatDurationMs(m.durationMs) ? ` · ${formatDurationMs(m.durationMs)}` : ""}{" "}
            · {m._count.transcripts} utterances / {m._count.summaries} minutes
          </p>
          {hit?.snippet ? (
            <p className="mt-1 line-clamp-2 text-xs text-[var(--text-secondary)]">{hit.snippet}</p>
          ) : null}
        </Link>
        {m.tags.length > 0 || showSeriesChip || (hit && hit.fields.length > 0) || m.endedAt ? (
          <p className="mt-1.5 flex flex-wrap items-center gap-1">
            {/* Recording/protection icon (RecordingBadges fills it in after querying STT) */}
            <span data-rec-badge={m.id} />
            {showSeriesChip ? (
              <Link
                href={hrefWith({ series: m.seriesName })}
                className="rounded-full border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] px-1.5 py-0.5 text-[10px] text-[var(--accent-sub)] hover:border-[var(--accent)]"
                title={`Show only "${m.seriesName}"`}
              >
                ↻ {m.seriesName}
              </Link>
            ) : null}
            {m.tags.map((t) => (
              <span
                key={t.name}
                className="rounded-full border border-[var(--border-strong)] px-1.5 py-0.5 text-[10px] text-[var(--text-secondary)]"
              >
                {t.name}
              </span>
            ))}
            {hit?.fields.map((f) => (
              <span
                key={f}
                className="rounded border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] px-1.5 py-0.5 text-[10px] text-[var(--accent-sub)]"
              >
                match: {f}
              </span>
            ))}
          </p>
        ) : null}
        {!readOnly ? (
          <div className="absolute right-1.5 top-1.5">
            <MeetingItemMenu id={m.id} archived={m.archivedAt !== null} />
          </div>
        ) : null}
      </div>
    );
  };

  // Wrap a card in swipe gestures unless read-only (external viewers cannot archive/trash).
  const swipeWrap = (node: ReactNode, ids: string[], label: string, archived = false) =>
    readOnly ? node : (
      <SwipeableRow ids={ids} label={label} archived={archived}>
        {node}
      </SwipeableRow>
    );

  const divider = (label: string) => (
    <li key={`__${label}`} className="px-1 pt-2 text-xs font-medium text-[var(--text-muted)]">
      {label}
    </li>
  );

  const entries: ReactNode[] = [];
  if (query) {
    for (const m of meetings) {
      entries.push(<li key={m.id}>{swipeWrap(card(m), [m.id], m.title, m.archivedAt !== null)}</li>);
    }
  } else {
    // Booked meetings sit above the rest, soonest first, and stay out of the series stacks: a
    // stack is a history, and folding a meeting that has not happened yet into one would put
    // the thing you are about to do behind a disclosure.
    const booked = meetings
      .filter((m) => m.upcoming)
      .sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
    if (booked.length > 0) {
      entries.push(divider("Upcoming"));
      for (const m of booked) {
        entries.push(<li key={m.id}>{swipeWrap(card(m), [m.id], m.title)}</li>);
      }
    }

    // A series used to be folded into one stacked entry. It is not any more: a weekly meeting
    // is a meeting, and hiding four of them behind a disclosure meant the list was not the list.
    // The series chip on each card filters to it instead, which is the same information without
    // taking the rows away.
    //
    // Sorted by when they happened rather than when the row was made, so the bands below are
    // monotonic — a meeting booked last month and recorded yesterday belongs to yesterday.
    const past = meetings
      .filter((m) => !m.upcoming)
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
    let lastBand: string | null = null;
    for (const m of past) {
      const b = bandOf(m.startedAt, now);
      if (b !== lastBand) {
        entries.push(divider(b));
        lastBand = b;
      }
      entries.push(<li key={m.id}>{swipeWrap(card(m), [m.id], m.title)}</li>);
    }
  }

  return (
    <div className="space-y-3">
      <MinutesWatcher initial={generatingId} />
      {meetings.length > 0 ? (
        <>
          <RecordingBadges ids={meetings.map((m) => m.id)} />
          <LiveStatus ids={meetings.map((m) => m.id)} />
        </>
      ) : null}

      <div className="flex justify-end gap-4">
        <Link
          href="/archive"
          className="inline-flex items-center gap-1 text-xs text-[var(--text-muted)] hover:text-[var(--foreground)]"
        >
          <ArchiveIcon className="h-3.5 w-3.5" />
          Archived
        </Link>
        {!readOnly ? (
          <Link
            href="/trash"
            className="inline-flex items-center gap-1 text-xs text-[var(--text-muted)] hover:text-[var(--foreground)]"
          >
            <TrashIcon className="h-3.5 w-3.5" />
            Trash
          </Link>
        ) : null}
      </div>

      <form action={base} className="flex flex-wrap items-center gap-2">
        {activeTag ? <input type="hidden" name="tag" value={activeTag} /> : null}
        {activeSeries ? <input type="hidden" name="series" value={activeSeries} /> : null}
        <input
          type="search"
          name="q"
          defaultValue={query}
          placeholder="Search (title, transcript, minutes)"
          className="input min-w-0 flex-1"
        />
        {filtering ? (
          <Link href={base} className="btn-outline shrink-0 !px-3" title="Clear filters">
            ×
          </Link>
        ) : null}
      </form>

      <TagFilter
        tags={allTags.map((t) => ({
          name: t.name,
          count: t._count.meetings,
          href: hrefWith({ tag: t.name === activeTag ? null : t.name }),
          active: t.name === activeTag,
        }))}
      />

      {/* The series is stated once, with its count and the way out of it. Repeating it in the
          line below would be three restatements of one filter stacked on top of each other. */}
      {activeSeries ? (
        <p className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] px-1.5 py-0.5 text-[10px] text-[var(--accent-sub)]">
            ↻ {activeSeries}
          </span>
          <span className="text-[var(--text-muted)]">{meetings.length} meeting(s) in this series</span>
          <Link href={hrefWith({ series: null })} className="text-[var(--text-muted)] underline">
            show all
          </Link>
        </p>
      ) : null}

      {query || activeTag ? (
        <p className="text-xs text-[var(--text-muted)]">
          {[query ? `"${query}"` : null, activeTag ? `tag "${activeTag}"` : null]
            .filter(Boolean)
            .join(" × ")}
          : {meetings.length} result(s)
        </p>
      ) : null}

      {meetings.length === 0 ? (
        <p className="rounded-lg border border-dashed border-[var(--border-strong)] p-6 text-center text-sm text-[var(--text-muted)]">
          {filtering ? "No matching meetings." : "No meetings yet."}
        </p>
      ) : (
        <ul className="space-y-2">{entries}</ul>
      )}

    </div>
  );
}
