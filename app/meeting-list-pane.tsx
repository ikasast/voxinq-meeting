import Link from "next/link";
import type { ReactNode } from "react";
import { prisma } from "@/lib/prisma";
import { buildMeetingWhere, makeSnippet } from "@/lib/meeting-filter";
import { formatDateTime, formatDuration } from "@/lib/utils";
import { SummaryStatusPoller } from "./[id]/summary-status-poller";
import { ArchiveIcon, TrashIcon } from "./icons";
import { MeetingItemMenu } from "./meeting-item-menu";
import { RecordingBadges } from "./recording-badges";
import { SeriesStack } from "./series-stack";
import { SwipeableRow } from "./swipeable-row";
import { TagFilter } from "./tag-filter";

type MeetingCardData = {
  id: string;
  title: string;
  startedAt: Date;
  endedAt: Date | null;
  archivedAt: Date | null;
  summaryStatus: string | null;
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
  activeId,
}: {
  q?: string;
  tag?: string;
  activeId?: string;
}) {
  const query = (q ?? "").trim();
  const activeTag = (tag ?? "").trim();

  const where = buildMeetingWhere({ query, tag: activeTag });

  const [meetingsRaw, allTags] = await Promise.all([
    prisma.meeting.findMany({
      where,
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
  const meetings: MeetingCardData[] = meetingsRaw.map((m) => ({
    ...m,
    seriesName: m.series?.name ?? null,
    seriesId: m.series?.id ?? null,
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

  const generating = meetings.some(
    (m) => m.summaryStatus === "processing" && m._count.summaries === 0,
  );
  const filtering = Boolean(query || activeTag);
  const base = activeId ? `/${activeId}` : "/";

  // Query string representing the current filters ("?..." or ""). overrides replaces individual parts.
  const queryString = (over: { tag?: string | null } = {}) => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    const t = "tag" in over ? over.tag : activeTag;
    if (t) params.set("tag", t);
    const s = params.toString();
    return s ? `?${s}` : "";
  };
  const hrefWith = (over: { tag?: string | null }) => `${base}${queryString(over)}`;

  const card = (m: MeetingCardData) => {
    const active = m.id === activeId;
    const hit = matched.get(m.id);
    return (
      <div className="relative">
        <Link
          href={`/${m.id}${queryString()}`}
          aria-current={active ? "page" : undefined}
          className={`block rounded-lg border p-3 transition ${
            active
              ? "border-[var(--accent)] bg-[var(--elevated)]"
              : "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--accent)]"
          }`}
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
            {m.endedAt ? null : <span className="tag-lime shrink-0">In progress</span>}
          </div>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            {formatDateTime(m.startedAt)}
            {formatDuration(m.startedAt, m.endedAt)
              ? ` · ${formatDuration(m.startedAt, m.endedAt)}`
              : ""}{" "}
            · {m._count.transcripts} utterances / {m._count.summaries} minutes
            {m.summaryStatus === "processing" && m._count.summaries === 0 ? " · generating…" : ""}
          </p>
          {hit?.snippet ? (
            <p className="mt-1 line-clamp-2 text-xs text-[var(--text-secondary)]">{hit.snippet}</p>
          ) : null}
          {m.tags.length > 0 || m.seriesName || (hit && hit.fields.length > 0) || m.endedAt ? (
            <p className="mt-1.5 flex flex-wrap items-center gap-1">
              {/* Recording/protection icon (RecordingBadges fills it in after querying STT) */}
              <span data-rec-badge={m.id} />
              {m.seriesName ? (
                <span
                  className="rounded-full border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] px-1.5 py-0.5 text-[10px] text-[var(--accent-sub)]"
                  title={`Series: ${m.seriesName}`}
                >
                  ↻ {m.seriesName}
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
        </Link>
        <div className="absolute right-1.5 top-1.5">
          <MeetingItemMenu id={m.id} archived={m.archivedAt !== null} />
        </div>
      </div>
    );
  };

  // Group recurring series into a single stacked entry (latest on top) — but only in
  // the plain list; during a search every hit should stay individually visible.
  const entries: ReactNode[] = [];
  if (query) {
    for (const m of meetings) {
      entries.push(
        <li key={m.id}>
          <SwipeableRow ids={[m.id]} label={m.title} archived={m.archivedAt !== null}>
            {card(m)}
          </SwipeableRow>
        </li>,
      );
    }
  } else {
    const seriesCounts = new Map<string, number>();
    for (const m of meetings) {
      if (m.seriesName) seriesCounts.set(m.seriesName, (seriesCounts.get(m.seriesName) ?? 0) + 1);
    }
    const seen = new Set<string>();
    for (const m of meetings) {
      if (!m.seriesName || (seriesCounts.get(m.seriesName) ?? 0) < 2) {
        entries.push(
          <li key={m.id}>
            <SwipeableRow ids={[m.id]} label={m.title}>
              {card(m)}
            </SwipeableRow>
          </li>,
        );
        continue;
      }
      if (seen.has(m.seriesName)) continue; // folded into the stack of its newest meeting
      seen.add(m.seriesName);
      const group = meetings.filter((x) => x.seriesName === m.seriesName);
      entries.push(
        <li key={m.id}>
          <SeriesStack
            name={m.seriesName}
            seriesId={m.seriesId}
            count={group.length}
            // Collapsed, the pile represents the whole series: swiping it archives or
            // trashes every meeting at once. Expanded rows act on a single meeting.
            seriesIds={group.map((x) => x.id)}
            latestId={group[0].id}
            latestTitle={group[0].title}
            latest={card(group[0])}
            rest={group.slice(1).map((x) => (
              <SwipeableRow key={x.id} ids={[x.id]} label={x.title}>
                {card(x)}
              </SwipeableRow>
            ))}
          />
        </li>,
      );
    }
  }

  return (
    <div className="space-y-3">
      {generating ? <SummaryStatusPoller /> : null}
      {meetings.length > 0 ? <RecordingBadges ids={meetings.map((m) => m.id)} /> : null}

      <form action={base} className="flex flex-wrap items-center gap-2">
        {activeTag ? <input type="hidden" name="tag" value={activeTag} /> : null}
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

      {filtering ? (
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

      <div className="flex justify-end gap-4 pt-1">
        <Link
          href="/archive"
          className="inline-flex items-center gap-1 text-xs text-[var(--text-muted)] hover:text-[var(--foreground)]"
        >
          <ArchiveIcon className="h-3.5 w-3.5" />
          Archived
        </Link>
        <Link
          href="/trash"
          className="inline-flex items-center gap-1 text-xs text-[var(--text-muted)] hover:text-[var(--foreground)]"
        >
          <TrashIcon className="h-3.5 w-3.5" />
          Trash
        </Link>
      </div>
    </div>
  );
}
