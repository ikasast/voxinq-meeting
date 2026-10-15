import Link from "next/link";
import { notFound } from "next/navigation";
import { extensionEnabled } from "@/lib/extensions-store";
import { formatDateTimeIn } from "@/lib/i18n/format";
import { currentLocale, serverT } from "@/lib/i18n/server";
import { prisma } from "@/lib/prisma";
import { REVIEW_SELECT, reviewView, type ReviewView } from "@/lib/review/view";

export const dynamic = "force-dynamic";

// Meeting feedback's history: every review asked for, by person and by kind of meeting (series),
// so it shows where somebody runs meetings well and where they are still finding their feet.
// Narrowed by role, person and series in the query string; a row goes to the meeting.

type Search = { role?: string; person?: string; series?: string };

/** A line through the scores, oldest to newest, scaled to 0–100. */
function Spark({ scores }: { scores: number[] }) {
  if (scores.length < 2) return null;
  const w = 120;
  const h = 26;
  const pts = scores.map((s, i) => `${(i / (scores.length - 1)) * w},${h - 3 - (s / 100) * (h - 6)}`).join(" ");
  const up = scores[scores.length - 1] >= scores[0];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-6 w-full max-w-[8rem]" aria-hidden>
      <polyline fill="none" stroke={up ? "var(--accent)" : "var(--warning)"} strokeWidth="2" points={pts} />
    </svg>
  );
}

export default async function ReviewsPage({ searchParams }: { searchParams: Promise<Search> }) {
  if (!(await extensionEnabled("review"))) notFound();
  const t = await serverT();
  const locale = await currentLocale();
  const q = await searchParams;

  const rows = await prisma.meetingReview.findMany({
    where: { meeting: { deletedAt: null } },
    orderBy: { createdAt: "desc" },
    take: 500,
    select: { ...REVIEW_SELECT, seriesId: true, meeting: { select: { title: true, startedAt: true } } },
  });
  const series = await prisma.series.findMany({ select: { id: true, name: true } });
  const seriesName = new Map(series.map((s) => [s.id, s.name]));

  const all = rows.map((r) => ({
    ...reviewView(r),
    seriesId: r.seriesId,
    title: r.meeting.title,
    startedAt: r.meeting.startedAt.toISOString(),
  }));
  const shown = all.filter(
    (r) =>
      (!q.role || r.role === q.role) &&
      (!q.person || r.person === q.person) &&
      (!q.series || (q.series === "none" ? r.seriesId === null : r.seriesId === q.series)),
  );

  // By person and role: the average, and the scores oldest first for the line.
  const byPerson = new Map<string, (typeof shown)[number][]>();
  for (const r of shown) {
    const k = `${r.role}\u0000${r.person}`;
    byPerson.set(k, [...(byPerson.get(k) ?? []), r]);
  }
  const people = [...byPerson.values()]
    .map((list) => ({
      person: list[0].person,
      role: list[0].role,
      avg: Math.round(list.reduce((a, r) => a + r.score, 0) / list.length),
      scores: [...list].reverse().map((r) => r.score),
      n: list.length,
    }))
    .sort((a, b) => b.n - a.n || b.avg - a.avg);

  // By series: the average, and the criterion with the lowest average score — where to look next.
  const bySeries = new Map<string, (typeof shown)[number][]>();
  for (const r of shown) {
    const k = r.seriesId ?? "none";
    bySeries.set(k, [...(bySeries.get(k) ?? []), r]);
  }
  const seriesRows = [...bySeries.entries()].map(([id, list]) => {
    const crit = new Map<string, { name: string; sum: number; n: number }>();
    for (const r of list)
      for (const c of r.criteria) {
        if (c.score === null) continue;
        const e = crit.get(c.name) ?? { name: c.name, sum: 0, n: 0 };
        e.sum += c.score;
        e.n += 1;
        crit.set(c.name, e);
      }
    const weakest = [...crit.values()].sort((a, b) => a.sum / a.n - b.sum / b.n)[0];
    return {
      id,
      name: id === "none" ? t("No series") : (seriesName.get(id) ?? t("No series")),
      avg: Math.round(list.reduce((a, r) => a + r.score, 0) / list.length),
      weakest: weakest?.name ?? "—",
      n: list.length,
    };
  });

  const roleLabel = (r: ReviewView["role"]) => (r === "facilitator" ? t("Facilitator") : t("Participant"));
  const persons = [...new Set(all.map((r) => r.person))].sort();
  const link = (next: Search) => {
    const p = new URLSearchParams(Object.entries({ ...q, ...next }).filter(([, v]) => v) as [string, string][]);
    const s = p.toString();
    return s ? `/reviews?${s}` : "/reviews";
  };

  return (
    <div data-paper className="mx-auto max-w-5xl space-y-5 pt-2 lg:pt-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-strong)]">{t("Feedback history")}</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          {t("Every piece of feedback asked for, by person and by kind of meeting.")}
        </p>
      </div>

      {/* Narrowing, as links: the page is the server's, and a link is shareable and goes Back. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="text-[var(--text-muted)]">{t("Role")}:</span>
          {[undefined, "facilitator", "participant"].map((r) => (
            <Link
              key={r ?? "all"}
              href={link({ role: r })}
              className={`rounded-full border px-2 py-0.5 ${q.role === r ? "border-[var(--accent)] text-[var(--accent-sub)]" : "border-[var(--border-strong)] text-[var(--text-secondary)]"}`}
            >
              {r ? roleLabel(r as ReviewView["role"]) : t("All")}
            </Link>
          ))}
        </span>
        {persons.length > 1 ? (
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="text-[var(--text-muted)]">{t("Person")}:</span>
            {[undefined, ...persons].map((p) => (
              <Link
                key={p ?? "all"}
                href={link({ person: p })}
                className={`rounded-full border px-2 py-0.5 ${q.person === p ? "border-[var(--accent)] text-[var(--accent-sub)]" : "border-[var(--border-strong)] text-[var(--text-secondary)]"}`}
              >
                {p ?? t("All")}
              </Link>
            ))}
          </span>
        ) : null}
      </div>

      {shown.length === 0 ? (
        <p className="border-y border-[var(--border)] py-6 text-sm text-[var(--text-muted)]">
          {t("No feedback yet. Ask for it from a meeting's Feedback tab.")}
        </p>
      ) : (
        <div className="grid gap-8 lg:grid-cols-2">
          <div className="space-y-6">
            <section>
              <h2 className="mb-1 text-sm font-semibold text-[var(--text-strong)]">{t("By person")}</h2>
              <ul className="divide-y divide-[var(--border)] border-y border-[var(--border)] text-sm">
                {people.map((p) => (
                  <li key={`${p.role}-${p.person}`} className="grid grid-cols-[minmax(0,1fr)_3rem_8rem_4rem] items-center gap-3 py-2">
                    <Link href={link({ person: p.person, role: p.role })} className="min-w-0 truncate text-[var(--foreground)] hover:underline">
                      {p.person}{" "}
                      <span className="rounded-full border border-[var(--border-strong)] px-1.5 text-[10px] text-[var(--text-muted)]">
                        {roleLabel(p.role)}
                      </span>
                    </Link>
                    <span className="text-right font-semibold tabular-nums text-[var(--text-strong)]">{p.avg}</span>
                    <Spark scores={p.scores} />
                    <span className="text-xs text-[var(--text-muted)]">{t(p.n === 1 ? "1 time" : "{n} times", { n: p.n })}</span>
                  </li>
                ))}
              </ul>
            </section>
            <section>
              <h2 className="mb-1 text-sm font-semibold text-[var(--text-strong)]">{t("By series")}</h2>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--text-muted)]">
                    <th className="py-1.5 font-normal">{t("Series")}</th>
                    <th className="py-1.5 text-right font-normal">{t("Average")}</th>
                    <th className="py-1.5 pl-4 font-normal">{t("Most room to grow")}</th>
                  </tr>
                </thead>
                <tbody>
                  {seriesRows.map((s) => (
                    <tr key={s.id} className="border-b border-[var(--border)]">
                      <td className="py-2">
                        <Link href={link({ series: s.id })} className="hover:underline">
                          {s.name}
                        </Link>
                      </td>
                      <td className="py-2 text-right tabular-nums">{s.avg}</td>
                      <td className="py-2 pl-4 text-[var(--text-secondary)]">{s.weakest}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </div>

          <section>
            <h2 className="mb-1 text-sm font-semibold text-[var(--text-strong)]">{t("All feedback")}</h2>
            <ul className="divide-y divide-[var(--border)] border-y border-[var(--border)] text-sm">
              {shown.map((r) => (
                <li key={r.id}>
                  <Link href={`/${r.meetingId}`} className="grid grid-cols-[minmax(0,1fr)_3rem] items-center gap-3 py-2 hover:bg-[var(--hover-surface)]">
                    <span className="min-w-0">
                      <span className="block truncate text-[var(--foreground)]">{r.title}</span>
                      <span className="block text-xs text-[var(--text-muted)]">
                        {formatDateTimeIn(locale, r.startedAt)} · {r.person} ({roleLabel(r.role)})
                      </span>
                    </span>
                    <span className="text-right font-semibold tabular-nums text-[var(--text-strong)]">{r.score}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}
