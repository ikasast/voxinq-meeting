import Link from "next/link";
import { isExternalRequest } from "@/lib/is-tailnet";
import { MeetingListPane } from "./meeting-list-pane";
import { serverT } from "@/lib/i18n/server";
import { PageHeader } from "./page-header";

export const dynamic = "force-dynamic";

// Home. On desktop, a 2-pane layout (left = meeting list / right = info panel);
// on mobile, the list only (opening a meeting navigates to the detail page).
// The header (PageHeader) is shared with the meeting detail page, so selecting one keeps the page skeleton unchanged.
export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tag?: string; series?: string; date?: string; month?: string }>;
}) {
  const { q, tag, series, date, month } = await searchParams;
  const external = await isExternalRequest();
  const t = await serverT();

  return (
    <div className="space-y-4">
      <PageHeader external={external} />

      <div className="grid gap-5 lg:grid-cols-[minmax(300px,400px)_1fr] lg:items-start">
        <MeetingListPane q={q} tag={tag} series={series} date={date} month={month} readOnly={external} />

        {/* Right panel (desktop only): guidance when no meeting is selected */}
        <section className="card hidden min-h-[50vh] flex-col items-center justify-center gap-4 p-10 text-center lg:flex">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-mark.svg" alt="" aria-hidden className="logo-dark h-16 w-16" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-mark-light.svg" alt="" aria-hidden className="logo-light h-16 w-16" />
          <p className="text-sm text-[var(--text-secondary)]">
            {t("Select a meeting from the list to see its minutes and transcript here.")}
          </p>
          {/* A meeting can be set up from anywhere; only recording one needs to be inside. */}
          <div className="flex flex-wrap justify-center gap-2">
            <Link href="/new" className="btn-ink">
              {t("+ New meeting")}
            </Link>
            {external ? null : (
              <Link href="/quick-record" className="btn-outline">
                {t("One-tap record")}
              </Link>
            )}
          </div>
          {external ? (
            <p className="text-sm text-[var(--text-muted)]">{t("Recording is available over Tailscale.")}</p>
          ) : null}
        </section>
      </div>
    </div>
  );
}
