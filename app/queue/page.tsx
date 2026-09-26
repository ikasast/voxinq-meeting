import { currentUser } from "@/lib/auth/session";
import { currentLocale, serverT } from "@/lib/i18n/server";
import { openJobsAcrossUsers, recentJobsAcrossUsers } from "@/lib/queue/queue";
import { QueueHistory } from "./queue-history";
import { QueueList, type QueueJob } from "./queue-list";

export const dynamic = "force-dynamic";

// The queue, as a page rather than as a disabled button.
//
// It lists everybody's work, because one GPU is shared and "why has mine not started" cannot be
// answered by a list with the reason missing from it. What it does not list is what anybody
// else's work is about: a kind, a person, a size, an elapsed time — and no meeting.
export default async function QueuePage() {
  const me = await currentUser();
  const t = await serverT();
  const [jobs, history, locale] = await Promise.all([
    openJobsAcrossUsers(me?.id ?? null),
    recentJobsAcrossUsers(me ? { id: me.id, isAdmin: me.isAdmin } : null),
    currentLocale(),
  ]);
  const initial: QueueJob[] = jobs.map((j) => ({
    id: j.id,
    kind: j.kind,
    status: j.status,
    meetingId: j.meetingId,
    startedAt: j.startedAt ? j.startedAt.toISOString() : null,
    vramMb: j.vramMb,
    mine: j.mine,
    title: j.title,
    owner: j.owner,
  }));

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-strong)]">
          {t("Queue")}
        </h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          {t("Work that needs the GPU, in the order it will get it.")}
        </p>
      </div>
      <QueueList initial={initial} isAdmin={me?.isAdmin ?? false} />

      {/* What already ran: how long it took, on what, and whether the model fitted on the card.
          Refreshes with the page rather than polling — it only changes when something ends. */}
      <section className="space-y-2 pt-4">
        <div>
          <h2 className="text-lg font-semibold text-[var(--text-strong)]">{t("History")}</h2>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            {me?.isAdmin
              ? t("Finished work on this machine, newest first (up to {n}).", { n: 40 })
              : t("Your finished work, newest first (up to {n}).", { n: 40 })}
          </p>
        </div>
        <QueueHistory rows={history} t={t} locale={locale} />
      </section>
    </div>
  );
}
