import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { semanticSearch } from "@/lib/embeddings";
import { prisma } from "@/lib/prisma";
import { type Period, buildMeetingWhere, makeSnippet, periodLabel, periodStart } from "@/lib/meeting-filter";
import { formatDateTime, formatDuration } from "@/lib/utils";
import { SummaryStatusPoller } from "./[id]/summary-status-poller";
import { RecordingBadges } from "./recording-badges";
import { SemanticIndexButton } from "./semantic-index-button";
import { TrashIcon } from "./icons";

const PERIODS: { id: Period; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "week", label: "This week" },
  { id: "month", label: "This month" },
];

// Left side of the 2-pane UI: meeting list with search/tag/period filters.
// Used by both the home page and the meeting detail page (activeId highlights the selected one).
export async function MeetingListPane({
  q,
  tag,
  period,
  mode,
  activeId,
}: {
  q?: string;
  tag?: string;
  period?: string;
  mode?: string;
  activeId?: string;
}) {
  const query = (q ?? "").trim();
  const activeTag = (tag ?? "").trim();
  const activePeriod = (["today", "week", "month"].includes(period ?? "") ? period : "") as Period;
  const aiMode = mode === "ai";

  // AI (semantic) search: rank by embedding similarity instead of keyword match.
  // Falls back to keyword search (with a note) when embeddings are unavailable.
  let semanticError: string | null = null;
  let semanticOrder: string[] = [];
  const similarity = new Map<string, number>();
  let unindexed = 0;
  if (aiMode && query) {
    try {
      const r = await semanticSearch(query, 30);
      semanticOrder = r.hits.map((h) => h.id);
      for (const h of r.hits) similarity.set(h.id, h.similarity);
      unindexed = r.unindexed;
    } catch (e) {
      semanticError = e instanceof Error ? e.message : "Semantic search failed";
    }
  }
  const semanticActive = aiMode && query.length > 0 && !semanticError;

  let where: Prisma.MeetingWhereInput;
  if (semanticActive) {
    // Semantic hits + the tag/period filters (archived meetings stay findable, like keyword search).
    const and: Prisma.MeetingWhereInput[] = [{ deletedAt: null }, { id: { in: semanticOrder } }];
    if (activeTag) and.push({ tags: { some: { name: activeTag } } });
    const from = periodStart(activePeriod);
    if (from) and.push({ startedAt: { gte: from } });
    where = { AND: and };
  } else {
    where = buildMeetingWhere({ query, tag: activeTag, period: activePeriod });
  }

  const [meetingsRaw, allTags] = await Promise.all([
    prisma.meeting.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        _count: { select: { transcripts: true, summaries: true } },
        tags: { select: { name: true }, orderBy: { name: "asc" } },
      },
    }),
    prisma.tag.findMany({
      where: { meetings: { some: { deletedAt: null } } },
      orderBy: { name: "asc" },
      include: { _count: { select: { meetings: { where: { deletedAt: null } } } } },
    }),
  ]);
  // In AI mode, order by similarity (best first) instead of creation date.
  const meetings = semanticActive
    ? [...meetingsRaw].sort(
        (a, b) => semanticOrder.indexOf(a.id) - semanticOrder.indexOf(b.id),
      )
    : meetingsRaw;

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
    for (const m of meetings) {
      const fields: string[] = [];
      let snippet: string | null = null;
      const needle = query.toLowerCase();
      if (m.title.toLowerCase().includes(needle)) fields.push("title");
      if (m.description?.toLowerCase().includes(needle)) {
        fields.push("purpose");
        snippet ??= makeSnippet(m.description, query);
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
  const filtering = Boolean(query || activeTag || activePeriod);
  const base = activeId ? `/${activeId}` : "/";

  // Query string representing the current filters ("?..." or ""). overrides replaces individual parts.
  const queryString = (over: { tag?: string | null; period?: Period | null } = {}) => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (aiMode) params.set("mode", "ai");
    const t = "tag" in over ? over.tag : activeTag;
    if (t) params.set("tag", t);
    const p = "period" in over ? over.period : activePeriod;
    if (p) params.set("period", p);
    const s = params.toString();
    return s ? `?${s}` : "";
  };
  // Filter link (keeps the current page base).
  const hrefWith = (over: { tag?: string | null; period?: Period | null }) =>
    `${base}${queryString(over)}`;

  return (
    <div className="space-y-3">
      {generating ? <SummaryStatusPoller /> : null}
      {meetings.length > 0 ? <RecordingBadges ids={meetings.map((m) => m.id)} /> : null}

      <form action={base} className="flex flex-wrap items-center gap-2">
        {activeTag ? <input type="hidden" name="tag" value={activeTag} /> : null}
        {activePeriod ? <input type="hidden" name="period" value={activePeriod} /> : null}
        <input
          type="search"
          name="q"
          defaultValue={query}
          placeholder={aiMode ? "Describe what you remember…" : "Search (title, transcript, minutes)"}
          className="input min-w-0 flex-1"
        />
        <label
          className="flex shrink-0 cursor-pointer items-center gap-1 text-xs text-[var(--text-secondary)]"
          title="AI search: finds meetings by meaning, even without the exact words"
        >
          <input type="checkbox" name="mode" value="ai" defaultChecked={aiMode} />
          AI
        </label>
        {filtering || aiMode ? (
          <Link href={base} className="btn-outline shrink-0 !px-3" title="Clear filters">
            ×
          </Link>
        ) : null}
      </form>

      {aiMode && query && semanticError ? (
        <p className="rounded-md border border-[color-mix(in_srgb,var(--warning)_45%,transparent)] bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] px-3 py-2 text-xs text-[var(--warning)]">
          AI search unavailable ({semanticError}) — showing keyword results instead.
        </p>
      ) : null}
      {semanticActive && unindexed > 0 ? <SemanticIndexButton unindexed={unindexed} /> : null}

      {/* Period filter */}
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="text-[var(--text-muted)]">Period:</span>
        {PERIODS.map((p) => {
          const on = p.id === activePeriod;
          return (
            <Link
              key={p.id}
              href={hrefWith({ period: on ? null : p.id })}
              className={`rounded-full border px-2.5 py-0.5 ${
                on
                  ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_18%,transparent)] text-[var(--accent-sub)]"
                  : "border-[var(--border-strong)] text-[var(--text-secondary)] hover:border-[var(--accent)]"
              }`}
            >
              {p.label}
            </Link>
          );
        })}
      </div>

      {/* Tag filter */}
      {allTags.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-[var(--text-muted)]">Tags:</span>
          {allTags.map((t) => {
            const on = t.name === activeTag;
            return (
              <Link
                key={t.id}
                href={hrefWith({ tag: on ? null : t.name })}
                className={`rounded-full border px-2.5 py-0.5 ${
                  on
                    ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_18%,transparent)] text-[var(--accent-sub)]"
                    : "border-[var(--border-strong)] text-[var(--text-secondary)] hover:border-[var(--accent)]"
                }`}
              >
                {t.name}（{t._count.meetings}）{on ? " ×" : ""}
              </Link>
            );
          })}
        </div>
      ) : null}

      {filtering ? (
        <p className="text-xs text-[var(--text-muted)]">
          {[
            query ? `"${query}"` : null,
            activeTag ? `tag "${activeTag}"` : null,
            periodLabel(activePeriod) ? `period "${periodLabel(activePeriod)}"` : null,
          ]
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
        <ul className="space-y-2">
          {meetings.map((m) => {
            const active = m.id === activeId;
            const hit = matched.get(m.id);
            return (
              <li key={m.id}>
                <Link
                  href={`/${m.id}${queryString()}`}
                  aria-current={active ? "page" : undefined}
                  className={`block rounded-lg border p-3 transition ${
                    active
                      ? "border-[var(--accent)] bg-[var(--elevated)]"
                      : "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--accent)]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium text-[var(--text-strong)]">
                      {m.title}
                    </span>
                    {m.archivedAt ? (
                      <span className="shrink-0 rounded-full border border-[var(--border-strong)] px-2 py-0.5 text-[10px] text-[var(--text-muted)]">
                        Archived
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
                    {m.summaryStatus === "processing" && m._count.summaries === 0
                      ? " · generating…"
                      : ""}
                  </p>
                  {hit?.snippet ? (
                    <p className="mt-1 line-clamp-2 text-xs text-[var(--text-secondary)]">
                      {hit.snippet}
                    </p>
                  ) : null}
                  {m.tags.length > 0 || (hit && hit.fields.length > 0) || similarity.has(m.id) || m.endedAt ? (
                    <p className="mt-1.5 flex flex-wrap items-center gap-1">
                      {/* Recording/protection badge (RecordingBadges fills it in after querying STT) */}
                      <span data-rec-badge={m.id} />
                      {m.tags.map((t) => (
                        <span
                          key={t.name}
                          className="rounded-full border border-[var(--border-strong)] px-1.5 py-0.5 text-[10px] text-[var(--text-secondary)]"
                        >
                          {t.name}
                        </span>
                      ))}
                      {similarity.has(m.id) ? (
                        <span className="rounded border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] px-1.5 py-0.5 text-[10px] text-[var(--accent-sub)]">
                          AI match {Math.round(similarity.get(m.id)! * 100)}%
                        </span>
                      ) : null}
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
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex justify-end pt-1">
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
