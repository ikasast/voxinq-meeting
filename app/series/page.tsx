import { notFound } from "next/navigation";
import Link from "next/link";
import { extensionEnabled } from "@/lib/extensions-store";
import { currentUser } from "@/lib/auth/session";
import { formatDateTimeIn } from "@/lib/i18n/format";
import { currentLocale, serverT } from "@/lib/i18n/server";
import { prisma } from "@/lib/prisma";
import { SeriesIcon } from "../icons";
import { NewSeriesButton } from "./new-series-button";

export const dynamic = "force-dynamic";

// Every recurring meeting in one place.
//
// The series pages existed and were only reachable by opening a meeting that happened to be in
// one — so a series you had not met about recently was, in practice, gone. This is the way in.
//
// Ordered by when the series last met rather than by name: the useful question is "what is
// running", and a project that finished two years ago should not sit above this week's.
export default async function SeriesListPage() {
  // Not there at all while Series is switched off.
  if (!(await extensionEnabled("series"))) notFound();
  const t = await serverT();
  const locale = await currentLocale();
  const me = await currentUser();
  // A `where` nested inside a `_count` is not rewritten by the scoped client, so the count has
  // to name the owner itself or it counts everybody's meetings.
  const mine = me ? { ownerId: me.id } : {};

  const rows = await prisma.series.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      description: true,
      standalone: true,
      _count: {
        select: { meetings: { where: { deletedAt: null, ...mine } }, members: true },
      },
      meetings: {
        where: { deletedAt: null, ...mine },
        orderBy: { startedAt: "desc" },
        take: 1,
        select: { startedAt: true },
      },
    },
  });

  // A series whose every meeting belongs to somebody else is not this person's to read. The
  // scoped client already hides those rows, but a series with meetings only in the trash comes
  // back at zero — and an entry that opens onto nothing is worse than no entry.
  const series = rows
    // …unless it was made on its own, where no meetings yet is what it is.
    .filter((s) => s._count.meetings > 0 || s.standalone)
    .sort((a, b) => {
      const at = a.meetings[0]?.startedAt?.getTime() ?? 0;
      const bt = b.meetings[0]?.startedAt?.getTime() ?? 0;
      return bt - at;
    });

  return (
    <div data-paper className="mx-auto max-w-[50rem] space-y-4 pt-2 lg:pt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-[var(--text-strong)]">
          <SeriesIcon className="h-5 w-5" />
          {t("Series")}
        </h1>
        <NewSeriesButton />
      </div>
      <p className="text-sm text-[var(--text-muted)]">
        {t("Meetings that keep happening. What they share is set once, on the series.")}
      </p>

      {series.length === 0 ? (
        <p className="border-y border-[var(--border)] py-6 text-sm text-[var(--text-muted)]">
          {t("No series yet. Create one with New series, or by naming it on a meeting under Purpose & agenda.")}
        </p>
      ) : (
        // Rows between hairlines, like the meeting list (v4), rather than a card each.
        <ul className="border-t border-[var(--border)]">
          {series.map((s) => (
            <li key={s.id} className="border-b border-[var(--border)]">
              <Link href={`/series/${s.id}`} className="flex items-baseline gap-3 px-2 py-3 hover:bg-[var(--panel)]">
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-sm font-medium text-[var(--text-strong)]">
                    <SeriesIcon className="h-4 w-4 shrink-0 text-[var(--accent-sub)]" />
                    <span className="truncate">{s.name}</span>
                  </span>
                  {s.description?.trim() ? (
                    <span className="mt-0.5 block truncate text-xs text-[var(--text-secondary)]">
                      {s.description.trim()}
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 text-right text-xs tabular-nums text-[var(--text-muted)]">
                  {t(s._count.meetings === 1 ? "1 meeting" : "{n} meetings", {
                    n: s._count.meetings,
                  })}
                  {s._count.members > 0
                    ? ` · ${t(s._count.members === 1 ? "1 member" : "{n} members", {
                        n: s._count.members,
                      })}`
                    : ""}
                  {s.meetings[0] ? (
                    <span className="block">
                      {t("last met {when}", { when: formatDateTimeIn(locale, s.meetings[0].startedAt) })}
                    </span>
                  ) : null}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
