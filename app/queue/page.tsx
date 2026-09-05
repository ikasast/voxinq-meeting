import { currentUser } from "@/lib/auth/session";
import { openJobsAcrossUsers } from "@/lib/queue/queue";
import { QueueList, type QueueJob } from "./queue-list";

export const dynamic = "force-dynamic";

// The queue, as a page rather than as a disabled button.
//
// It lists everybody's work, because one GPU is shared and "why has mine not started" cannot be
// answered by a list with the reason missing from it. What it does not list is what anybody
// else's work is about: a kind, a person, a size, an elapsed time — and no meeting.
export default async function QueuePage() {
  const me = await currentUser();
  const jobs = await openJobsAcrossUsers(me?.id ?? null);
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
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-strong)]">Queue</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Work that needs the GPU, in the order it will get it.
        </p>
      </div>
      <QueueList initial={initial} />
    </div>
  );
}
