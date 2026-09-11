import Link from "next/link";
import { currentUser } from "@/lib/auth/session";
import { formatDateTimeIn } from "@/lib/i18n/format";
import { currentLocale, serverT } from "@/lib/i18n/server";
import { prisma } from "@/lib/prisma";
import { SeriesIcon } from "../icons";

export const dynamic = "force-dynamic";

// Every recurring meeting in one place.
//
// The series pages existed and were only reachable by opening a meeting that happened to be in
// one — so a series you had not met about recently was, in practice, gone. This is the way in.
//
// Ordered by when the series last met rather than by name: the useful question is "what is
// running", and a project that finished two years ago should not sit above this week's.
export default async function SeriesListPage() {
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
    .filter((s) => s._count.meetings > 0)
    .sort((a, b) => {
      const at = a.meetings[0]?.startedAt?.getTime() ?? 0;
      const bt = b.meetings[0]?.startedAt?.getTime() ?? 0;
      return bt - at;
    });

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-[var(--text-strong)]">
          <SeriesIcon className="h-5 w-5" />
          {t("Series")}
        </h1>
        <Link href="/" className="btn-outline">
          {t("Back to list")}
        </Link>
      </div>
      <p className="text-sm text-[var(--text-muted)]">
        {t(
          "A series is a meeting that keeps happening. What every instance of it has in common — the background, the regular members, the minutes format, the terms — is set once on its own page and applied to each meeting filed under it.",
        )}
      </p>

      {series.length > 0 ? (
        <p className="text-xs text-[var(--text-muted)]">
          {t("A new series starts when you name one on a meeting, under Purpose & agenda.")}
        </p>
      ) : null}

      {series.length === 0 ? (
        <p className="rounded-lg border border-dashed border-[var(--border-strong)] p-6 text-center text-sm text-[var(--text-muted)]">
          {t("No series yet. Name one on a meeting — under Purpose & agenda — and it appears here.")}
        </p>
      ) : (
        <ul className="space-y-2">
          {series.map((s) => (
            <li key={s.id}>
              <Link
                href={`/series/${s.id}`}
                className="card flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 p-4 hover:border-[var(--accent)]"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-[var(--text-strong)]">
                    ↻ {s.name}
                  </span>
                  {s.description?.trim() ? (
                    <span className="mt-0.5 block truncate text-xs text-[var(--text-secondary)]">
                      {s.description.trim()}
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 text-xs text-[var(--text-muted)]">
                  {t(s._count.meetings === 1 ? "1 meeting" : "{n} meetings", {
                    n: s._count.meetings,
                  })}
                  {s._count.members > 0
                    ? ` · ${t(s._count.members === 1 ? "1 member" : "{n} members", {
                        n: s._count.members,
                      })}`
                    : ""}
                  {s.meetings[0]
                    ? ` · ${t("last met {when}", {
                        when: formatDateTimeIn(locale, s.meetings[0].startedAt),
                      })}`
                    : ""}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
