import Link from "next/link";
import { isExternalRequest } from "@/lib/is-tailnet";
import { MeetingListPane } from "./meeting-list-pane";
import { PageHeader } from "./page-header";

export const dynamic = "force-dynamic";

// Home. On desktop, a 2-pane layout (left = meeting list / right = info panel);
// on mobile, the list only (opening a meeting navigates to the detail page).
// The header (PageHeader) is shared with the meeting detail page, so selecting one keeps the page skeleton unchanged.
export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tag?: string }>;
}) {
  const { q, tag } = await searchParams;
  const external = await isExternalRequest();

  return (
    <div className="space-y-4">
      <PageHeader external={external} />

      <div className="grid gap-5 lg:grid-cols-[minmax(300px,360px)_1fr] lg:items-start">
        <MeetingListPane q={q} tag={tag} />

        {/* Right panel (desktop only): guidance when no meeting is selected */}
        <section className="card hidden min-h-[50vh] flex-col items-center justify-center gap-4 p-10 text-center lg:flex">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-mark.svg" alt="" aria-hidden className="logo-dark h-16 w-16" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-mark-light.svg" alt="" aria-hidden className="logo-light h-16 w-16" />
          <p className="text-sm text-[var(--text-secondary)]">
            Select a meeting from the list to see its minutes and transcript here.
          </p>
          {external ? (
            <p className="text-sm text-[var(--text-muted)]">Recording is available over Tailscale.</p>
          ) : (
            <div className="flex flex-wrap justify-center gap-2">
              <Link href="/new" className="btn-ink">
                + New meeting
              </Link>
              <Link href="/quick-record" className="btn-outline">
                One-tap record
              </Link>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
