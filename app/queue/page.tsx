import { openJobs } from "@/lib/queue/queue";
import { QueueList, type QueueJob } from "./queue-list";

export const dynamic = "force-dynamic";

// The queue, as a page rather than as a disabled button.
export default async function QueuePage() {
  const jobs = await openJobs();
  const initial: QueueJob[] = jobs.map((j) => ({
    id: j.id,
    kind: j.kind,
    status: j.status,
    meetingId: j.meetingId,
    startedAt: j.startedAt ? j.startedAt.toISOString() : null,
    vramMb: j.vramMb,
    meeting: j.meeting ? { title: j.meeting.title } : null,
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
