import Link from "next/link";
import { isExternalRequest } from "@/lib/is-tailnet";
import { MeetingListPane } from "./meeting-list-pane";
import { currentLocale, serverT } from "@/lib/i18n/server";
import { formatDateTimeIn } from "@/lib/i18n/format";
import { HomeStart } from "./home-start";
import { sidebarMeetings } from "./sidebar-meetings";

export const dynamic = "force-dynamic";

// The first screen (v4, design B): three ways to start a meeting, and the last few meetings.
// The meetings themselves live in the sidebar; asked for a search or the whole list
// ("All meetings"), this is the list, with its filters, calendar and bulk minutes.
export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tag?: string; series?: string; date?: string; month?: string; list?: string }>;
}) {
  const { q, tag, series, date, month, list } = await searchParams;
  const external = await isExternalRequest();

  if (q || tag || series || date || month || list) {
    return (
      <div className="mx-auto max-w-3xl">
        <MeetingListPane q={q} tag={tag} series={series} date={date} month={month} readOnly={external} />
      </div>
    );
  }

  const t = await serverT();
  const locale = await currentLocale();
  const recent = (await sidebarMeetings()).filter((m) => !m.upcoming).slice(0, 6);

  return (
    <div className="mx-auto max-w-4xl space-y-10 pt-4 lg:pt-10">
      <HomeStart external={external} />
      {recent.length > 0 ? (
        <section>
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold text-[var(--text-strong)]">{t("Recent meetings")}</h2>
            <Link href="/?list=1" className="text-xs text-[var(--accent-sub)] hover:underline">
              {t("All meetings")}
            </Link>
          </div>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {recent.map((m) => (
              <li key={m.id}>
                <Link
                  href={`/${m.id}`}
                  className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 hover:border-[var(--accent)]"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-[var(--text-strong)]">{m.title}</span>
                    <span className="block text-xs text-[var(--text-muted)]">{formatDateTimeIn(locale, new Date(m.at))}</span>
                  </span>
                  {m.live ? (
                    <span className="tag-warn shrink-0">{t("Recording")}</span>
                  ) : m.noMinutes ? (
                    <span className="tag-warn shrink-0">{t("No minutes")}</span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
