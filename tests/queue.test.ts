import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../lib/prisma";
import { claimNext, enqueue, finish, openJobFor, recoverInterrupted } from "../lib/queue/queue";
import { reorderQueue } from "../lib/queue/reorder";

// The queue against a real PostgreSQL, because the things that can go wrong here are things
// only a database does: two claims interleaving, an ordering that reads correctly and sorts
// wrongly, a row left `running` by a process that is no longer there.
//
// **Opt-in on purpose.** These write to the database `DATABASE_URL` names, and `claimNext`
// takes whatever is queued — including a real instance's work. Someone whose `DATABASE_URL`
// points at their own Voxinq must not have `npm test` reach into their queue, so the tests do
// nothing unless VOXINQ_QUEUE_DB_TESTS says the database is disposable. CI sets it; its
// database is a container that lives for the length of the run.

const ENABLED = process.env.VOXINQ_QUEUE_DB_TESTS === "1";
let reachable = false;

beforeAll(async () => {
  if (!ENABLED) return;
  await prisma.$queryRaw`SELECT 1`;
  // Start from an empty queue. `claimNext` takes whatever is waiting, so a row left over from
  // anything else makes the capacity and ordering tests assert about the wrong queue — which is
  // how these first failed, against a database that had been used for a screenshot. Emptying it
  // is only safe because VOXINQ_QUEUE_DB_TESTS already says this database is disposable.
  await prisma.job.deleteMany({});
  reachable = true;
});

const made: string[] = [];
async function job(over: Parameters<typeof enqueue>[0]) {
  const j = await enqueue(over);
  made.push(j.id);
  return j.id;
}

afterEach(async () => {
  if (made.length) await prisma.job.deleteMany({ where: { id: { in: made } } });
  made.length = 0;
});

describe.skipIf(!ENABLED)("the queue", () => {
  it("is reachable (set VOXINQ_QUEUE_DB_TESTS=1 against a disposable database)", () => {
    expect(reachable).toBe(true);
  });

  it("hands out nothing when nothing is waiting", async () => {
    expect(await claimNext()).toBeNull();
  });

  it("hands out the oldest first", async () => {
    const a = await job({ kind: "minutes", params: { tag: "a" } });
    const b = await job({ kind: "minutes", params: { tag: "b" } });
    const first = await claimNext();
    expect(first?.id).toBe(a);
    await finish(a, "done");
    const second = await claimNext();
    expect(second?.id).toBe(b);
    await finish(b, "done");
  });

  it("lets position override age, which is what reordering will write", async () => {
    const older = await job({ kind: "minutes", params: { tag: "older" }, position: 10 });
    const newer = await job({ kind: "minutes", params: { tag: "newer" }, position: 1 });
    const first = await claimNext();
    expect(first?.id, "the job moved to the front should go first").toBe(newer);
    await finish(newer, "done");
    expect((await claimNext())?.id).toBe(older);
    await finish(older, "done");
  });

  it("stops at the capacity it is given", async () => {
    const a = await job({ kind: "minutes" });
    await job({ kind: "minutes" });
    expect((await claimNext(1))?.id).toBe(a);
    // One is running, so a second may not start — this is the whole of the GPU rule today.
    expect(await claimNext(1)).toBeNull();
    // Room for two, and the second goes.
    expect(await claimNext(2)).not.toBeNull();
    await prisma.job.updateMany({ where: { id: { in: made } }, data: { status: "done" } });
  });

  it("never hands the same job to two callers", async () => {
    await job({ kind: "minutes" });
    // Both claims race against the same single queued row. `FOR UPDATE SKIP LOCKED` is what
    // makes the loser see nothing rather than the same row.
    const [x, y] = await Promise.all([claimNext(2), claimNext(2)]);
    const got = [x, y].filter(Boolean);
    expect(got).toHaveLength(1);
  });

  it("counts a run against capacity even when it was started by someone else", async () => {
    // A row left `running` — by another process, or by this one before a crash.
    const stuck = await job({ kind: "minutes" });
    await prisma.job.update({ where: { id: stuck }, data: { status: "running" } });
    await job({ kind: "minutes" });
    expect(await claimNext(1)).toBeNull();
  });

  it("puts back what a restart interrupted, and says so", async () => {
    const id = await job({ kind: "minutes" });
    await prisma.job.update({ where: { id }, data: { status: "running" } });

    const n = await recoverInterrupted();
    expect(n).toBeGreaterThanOrEqual(1);

    const back = await prisma.job.findUniqueOrThrow({ where: { id } });
    expect(back.status).toBe("queued");
    expect(back.startedAt).toBeNull();
    // The reason matters: a job that silently starts over looks like a bug to whoever is
    // watching the progress bar go back to zero.
    expect(back.detail).toMatch(/restart/i);
  });

  it("reorders what is waiting, and leaves what is running alone", async () => {
    const a = await job({ kind: "minutes" });
    const b = await job({ kind: "diarize" });
    const c = await job({ kind: "transcribe" });
    // One of them is already going: it has no position any more, it is in progress.
    await prisma.job.update({ where: { id: a }, data: { status: "running" } });

    await reorderQueue([c, b]);
    const after = await prisma.job.findMany({
      where: { id: { in: [b, c] } },
      orderBy: { position: "asc" },
      select: { id: true },
    });
    expect(after.map((j) => j.id)).toEqual([c, b]);
    expect((await prisma.job.findUniqueOrThrow({ where: { id: a } })).status).toBe("running");
    await prisma.job.updateMany({ where: { id: { in: made } }, data: { status: "done" } });
  });

  it("keeps a job the caller did not mention, at the back", async () => {
    // The screen listing the queue and the drag being let go are not the same moment: a job can
    // arrive in between. Dropping it because nobody named it would lose work silently.
    const a = await job({ kind: "minutes" });
    const b = await job({ kind: "diarize" });
    const late = await job({ kind: "transcribe" });
    await reorderQueue([b, a]);
    const order = await prisma.job.findMany({
      where: { id: { in: [a, b, late] } },
      orderBy: { position: "asc" },
      select: { id: true },
    });
    expect(order.map((j) => j.id)).toEqual([b, a, late]);
    await prisma.job.updateMany({ where: { id: { in: made } }, data: { status: "done" } });
  });

  it("ignores an id that is not waiting any more", async () => {
    const a = await job({ kind: "minutes" });
    await reorderQueue(["a-job-that-finished-while-you-dragged", a]);
    expect((await prisma.job.findUniqueOrThrow({ where: { id: a } })).position).toBe(1);
    await finish(a, "done");
  });

  it("knows when a meeting already has one, and when it no longer does", async () => {
    const meeting = await prisma.meeting.create({
      data: { title: "queue test", startedAt: new Date() },
      select: { id: true },
    });
    try {
      expect(await openJobFor("minutes", meeting.id)).toBeNull();
      const id = await job({ kind: "minutes", meetingId: meeting.id });
      expect(await openJobFor("minutes", meeting.id)).not.toBeNull();
      await finish(id, "done");
      // Finished is not open: the next request is a regeneration, which is allowed.
      expect(await openJobFor("minutes", meeting.id)).toBeNull();
    } finally {
      await prisma.meeting.delete({ where: { id: meeting.id } });
    }
  });
});
