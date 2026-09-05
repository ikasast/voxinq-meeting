import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { asSystem } from "../lib/db/scope";
import { prisma } from "../lib/prisma";
import { claimNext, enqueue, finish, openJobFor, recoverInterrupted } from "../lib/queue/queue";
import { reorderQueue } from "../lib/queue/reorder";
import {
  gpuContenders,
  preemptForRecording,
  releaseRecording,
  reserveForRecording,
  sweepStaleRecordings,
} from "../lib/queue/recording";
import { RECORDING_KIND } from "../lib/queue/types";

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

// Capacity is measured in MB now, so the tests price their jobs. SLOT is what a job "costs"
// when a test wants one to fill the card.
const SLOT = 4000;
const BUDGET = 100_000; // room for anything
const ONE_SLOT = SLOT;
const TWO_SLOTS = SLOT * 2;
let reachable = false;

beforeAll(async () => {
  if (!ENABLED) return;
  await sys(async () => {
  await prisma.$queryRaw`SELECT 1`;
  // Start from an empty queue. `claimNext` takes whatever is waiting, so a row left over from
  // anything else makes the capacity and ordering tests assert about the wrong queue — which is
  // how these first failed, against a database that had been used for a screenshot. Emptying it
  // is only safe because VOXINQ_QUEUE_DB_TESTS already says this database is disposable.
  await prisma.job.deleteMany({});
  reachable = true;
  });
});


// Every query below runs outside a request, and the scoped client refuses those unless they say
// what they are — which is the point of it. The queue is the scheduler, so these say "system",
// exactly as the dispatcher does.
const sys = <T>(fn: () => Promise<T>) => asSystem("queue tests exercise the scheduler", fn);
const sysIt = (name: string, fn: () => void | Promise<void>) =>
  it(name, () => sys(async () => void (await fn())));

const made: string[] = [];
async function job(over: Parameters<typeof enqueue>[0]) {
  const j = await enqueue(over);
  made.push(j.id);
  return j.id;
}

afterEach(async () => {
  if (made.length) await sys(() => prisma.job.deleteMany({ where: { id: { in: made } } }));
  made.length = 0;
});

describe.skipIf(!ENABLED)("the queue", () => {
  sysIt("is reachable (set VOXINQ_QUEUE_DB_TESTS=1 against a disposable database)", () => {
    expect(reachable).toBe(true);
  });

  sysIt("hands out nothing when nothing is waiting", async () => {
    expect(await claimNext(BUDGET)).toBeNull();
  });

  sysIt("hands out the oldest first", async () => {
    const a = await job({ kind: "minutes", params: { tag: "a" } });
    const b = await job({ kind: "minutes", params: { tag: "b" } });
    const first = await claimNext(BUDGET);
    expect(first?.id).toBe(a);
    await finish(a, "done");
    const second = await claimNext(BUDGET);
    expect(second?.id).toBe(b);
    await finish(b, "done");
  });

  sysIt("lets position override age, which is what reordering will write", async () => {
    const older = await job({ kind: "minutes", params: { tag: "older" }, position: 10 });
    const newer = await job({ kind: "minutes", params: { tag: "newer" }, position: 1 });
    const first = await claimNext(BUDGET);
    expect(first?.id, "the job moved to the front should go first").toBe(newer);
    await finish(newer, "done");
    expect((await claimNext(BUDGET))?.id).toBe(older);
    await finish(older, "done");
  });

  sysIt("stops at the capacity it is given", async () => {
    const a = await job({ kind: "minutes", vramMb: SLOT });
    await job({ kind: "minutes", vramMb: SLOT });
    expect((await claimNext(ONE_SLOT))?.id).toBe(a);
    // One is running, so a second may not start — this is the whole of the GPU rule today.
    expect(await claimNext(ONE_SLOT)).toBeNull();
    // Room for two, and the second goes.
    expect(await claimNext(TWO_SLOTS)).not.toBeNull();
    await prisma.job.updateMany({ where: { id: { in: made } }, data: { status: "done" } });
  });

  sysIt("never hands the same job to two callers", async () => {
    await job({ kind: "minutes" });
    // Both claims race against the same single queued row. `FOR UPDATE SKIP LOCKED` is what
    // makes the loser see nothing rather than the same row.
    const [x, y] = await Promise.all([claimNext(2), claimNext(2)]);
    const got = [x, y].filter(Boolean);
    expect(got).toHaveLength(1);
  });

  sysIt("counts a run against capacity even when it was started by someone else", async () => {
    // A row left `running` — by another process, or by this one before a crash.
    const stuck = await job({ kind: "minutes", vramMb: SLOT });
    await prisma.job.update({ where: { id: stuck }, data: { status: "running" } });
    await job({ kind: "minutes", vramMb: SLOT });
    expect(await claimNext(ONE_SLOT)).toBeNull();
  });

  sysIt("starts free work beside a job that is holding the card", async () => {
    // The whole point of measuring rather than counting: recognition sent to an endpoint uses
    // no video memory, and used to queue behind hardware it never touched.
    const heavy = await job({ kind: "minutes", vramMb: SLOT });
    await prisma.job.update({ where: { id: heavy }, data: { status: "running" } });
    const free = await job({ kind: "transcribe", vramMb: 0 });
    expect((await claimNext(ONE_SLOT))?.id).toBe(free);
    await prisma.job.updateMany({ where: { id: { in: made } }, data: { status: "done" } });
  });

  sysIt("steps over what does not fit and takes what does", async () => {
    const heavy = await job({ kind: "minutes", vramMb: SLOT });
    await prisma.job.update({ where: { id: heavy }, data: { status: "running" } });
    await job({ kind: "diarize", vramMb: SLOT, position: 1 }); // too big to join it
    const small = await job({ kind: "transcribe", vramMb: 0, position: 2 });
    expect((await claimNext(ONE_SLOT))?.id, "the one that fits should go").toBe(small);
    await prisma.job.updateMany({ where: { id: { in: made } }, data: { status: "done" } });
  });

  sysIt("runs a job bigger than the whole budget, alone", async () => {
    // Otherwise a budget set too low, or an estimate that is wrong, is a queue that never
    // moves and never says why.
    const huge = await job({ kind: "minutes", vramMb: 999_999 });
    expect((await claimNext(1024))?.id).toBe(huge);
    // And nothing joins it while it holds more than everything.
    await job({ kind: "transcribe", vramMb: 0 });
    expect(await claimNext(1024)).toBeNull();
    await prisma.job.updateMany({ where: { id: { in: made } }, data: { status: "done" } });
  });

  sysIt("puts back what a restart interrupted, and says so", async () => {
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

  sysIt("reorders what is waiting, and leaves what is running alone", async () => {
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

  sysIt("keeps a job the caller did not mention, at the back", async () => {
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

  sysIt("ignores an id that is not waiting any more", async () => {
    const a = await job({ kind: "minutes" });
    await reorderQueue(["a-job-that-finished-while-you-dragged", a]);
    expect((await prisma.job.findUniqueOrThrow({ where: { id: a } })).position).toBe(1);
    await finish(a, "done");
  });

  sysIt("knows when a meeting already has one, and when it no longer does", async () => {
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

describe.skipIf(!ENABLED)("a recording's claim on the card", () => {
  async function meeting(title: string) {
    return (
      await prisma.meeting.create({ data: { title, startedAt: new Date() }, select: { id: true } })
    ).id;
  }

  sysIt("counts only what is actually on the GPU as being in the way", async () => {
    const m = await meeting("recording test");
    try {
      const heavy = await job({ kind: "minutes", meetingId: m, vramMb: SLOT });
      const elsewhere = await job({ kind: "transcribe", meetingId: m, vramMb: 0 });
      await prisma.job.updateMany({
        where: { id: { in: [heavy, elsewhere] } },
        data: { status: "running" },
      });
      // The off-GPU one is running too, and is no reason to ask anybody anything: it is a cloud
      // model's memory being used, not this card's. Asking about it would teach people to click
      // through the question, which is how the answer stops meaning anything.
      expect((await gpuContenders()).map((c) => c.id)).toEqual([heavy]);
    } finally {
      await prisma.job.deleteMany({ where: { meetingId: m } });
      await prisma.meeting.delete({ where: { id: m } });
    }
  });

  sysIt("puts what it interrupted back at the front, and says why", async () => {
    const m = await meeting("recording test");
    try {
      const heavy = await job({ kind: "minutes", meetingId: m, vramMb: SLOT });
      await prisma.job.update({ where: { id: heavy }, data: { status: "running" } });

      expect(await preemptForRecording()).toBe(1);

      const back = await prisma.job.findUniqueOrThrow({ where: { id: heavy } });
      // Requeued, not thrown away: whoever pressed record wants to record, not to lose the
      // minutes they asked for ten minutes ago.
      expect(back.status).toBe("queued");
      expect(back.startedAt).toBeNull();
      expect(back.position).toBe(0);
      expect(back.detail).toContain("Interrupted so a recording could start");
    } finally {
      await prisma.job.deleteMany({ where: { meetingId: m } });
      await prisma.meeting.delete({ where: { id: m } });
    }
  });

  sysIt("survives this process restarting, because the recording does", async () => {
    const m = await prisma.meeting.create({
      data: { title: "recording through a redeploy", startedAt: new Date() },
      select: { id: true },
    });
    try {
      const held = await reserveForRecording(m.id, "large-v3-turbo");
      made.push(held.id);
      const other = await job({ kind: "minutes", meetingId: m.id, vramMb: SLOT });
      await prisma.job.update({ where: { id: other }, data: { status: "running" } });

      await recoverInterrupted();

      // A recording is a browser talking straight to the STT service; restarting the web app
      // does not interrupt it, so the card really is still in use. Requeueing the hold would
      // drop it mid-meeting and let something heavy start underneath.
      expect((await prisma.job.findUniqueOrThrow({ where: { id: held.id } })).status).toBe(
        "running",
      );
      // Everything that this process was actually running does go back in the queue.
      expect((await prisma.job.findUniqueOrThrow({ where: { id: other } })).status).toBe("queued");
    } finally {
      await prisma.job.deleteMany({ where: { meetingId: m.id } });
      await prisma.meeting.delete({ where: { id: m.id } });
    }
  });

  sysIt("holds the card until the meeting ends, then gives it back", async () => {
    const rec = await meeting("the one being recorded");
    const other = await meeting("the one that was waiting");
    try {
      const waiting = await job({ kind: "minutes", meetingId: other, vramMb: TWO_SLOTS });
      const held = await reserveForRecording(rec, "large-v3-turbo");
      made.push(held.id);
      // Pressing record twice is one recording, not two claims on the same card.
      expect((await reserveForRecording(rec, "large-v3-turbo")).id).toBe(held.id);

      // Room for the waiting job on its own, and one megabyte short of room for it beside the
      // recording. Derived from what the reservation actually took rather than a number written
      // here, so the test keeps testing admission when the model table changes.
      const cost = (await prisma.job.findUniqueOrThrow({ where: { id: held.id } })).vramMb;
      expect(cost).toBeGreaterThan(0);
      const budget = TWO_SLOTS + cost - 1;
      expect(await claimNext(budget)).toBeNull();
      expect((await prisma.job.findUniqueOrThrow({ where: { id: waiting } })).status).toBe("queued");

      expect(await releaseRecording(rec)).toBe(1);
      expect((await claimNext(budget))?.id).toBe(waiting);
    } finally {
      await prisma.job.deleteMany({ where: { meetingId: { in: [rec, other] } } });
      await prisma.meeting.deleteMany({ where: { id: { in: [rec, other] } } });
    }
  });
});

describe.skipIf(!ENABLED)("a hold left behind by a browser that went away", () => {
  // The reservation is released by the screen that took it — on ending, on unmount, on
  // `pagehide`. None of those fire for a browser that is killed, a phone that discards the tab,
  // or a laptop closed on the way out of the room. What is left is a card that looks occupied
  // forever, so the sweep asks the STT service which meetings actually have a live connection.
  let server: import("node:http").Server;
  let port = 0;
  let answer: Record<string, string | null> = {};
  let asked = 0;

  beforeAll(async () => {
    if (!ENABLED) return;
    const http = await import("node:http");
    server = http.createServer((req, res) => {
      asked += 1;
      // Drain the body. A response sent while the request is still being written is a reset on
      // Windows, which is how this pattern failed the first time it was used here.
      req.on("data", () => {});
      req.on("end", () => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(answer));
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    port = (server.address() as import("node:net").AddressInfo).port;
  });

  afterAll(() => server?.close());

  async function heldSince(meetingId: string, ms: number) {
    const j = await prisma.job.create({
      data: {
        kind: RECORDING_KIND,
        meetingId,
        status: "running",
        vramMb: 1500,
        startedAt: new Date(Date.now() - ms),
      },
      select: { id: true },
    });
    made.push(j.id);
    return j.id;
  }
  const status = async (id: string) =>
    (await prisma.job.findUniqueOrThrow({ where: { id } })).status;

  sysIt("leaves a recording that is still connected alone", async () => {
    const m = await prisma.meeting.create({
      data: { title: "still going", startedAt: new Date() },
      select: { id: true },
    });
    try {
      const id = await heldSince(m.id, 10 * 60_000);
      answer = { [m.id]: "recording" };
      process.env.STT_INTERNAL_URL = `http://127.0.0.1:${port}`;
      expect(await sweepStaleRecordings()).toBe(0);
      expect(await status(id)).toBe("running");
    } finally {
      await prisma.job.deleteMany({ where: { meetingId: m.id } });
      await prisma.meeting.delete({ where: { id: m.id } });
    }
  });

  sysIt("leaves one that only just started alone, connection or not", async () => {
    const m = await prisma.meeting.create({
      data: { title: "just pressed record", startedAt: new Date() },
      select: { id: true },
    });
    try {
      // The hold is taken before the websocket exists. Sweeping inside that window would take
      // the card away from a recording that is still opening its connection.
      const id = await heldSince(m.id, 1000);
      answer = {};
      const before = asked;
      process.env.STT_INTERNAL_URL = `http://127.0.0.1:${port}`;
      expect(await sweepStaleRecordings()).toBe(0);
      expect(asked).toBe(before); // not even asked about
      expect(await status(id)).toBe("running");
    } finally {
      await prisma.job.deleteMany({ where: { meetingId: m.id } });
      await prisma.meeting.delete({ where: { id: m.id } });
    }
  });

  sysIt("takes the card back when nothing is recording that meeting any more", async () => {
    const m = await prisma.meeting.create({
      data: { title: "the tab was closed", startedAt: new Date() },
      select: { id: true },
    });
    try {
      const id = await heldSince(m.id, 10 * 60_000);
      answer = { [m.id]: null };
      process.env.STT_INTERNAL_URL = `http://127.0.0.1:${port}`;
      expect(await sweepStaleRecordings()).toBe(1);
      expect(await status(id)).toBe("done");
    } finally {
      await prisma.job.deleteMany({ where: { meetingId: m.id } });
      await prisma.meeting.delete({ where: { id: m.id } });
    }
  });

  sysIt("releases nothing when the service cannot be reached", async () => {
    const m = await prisma.meeting.create({
      data: { title: "cannot tell", startedAt: new Date() },
      select: { id: true },
    });
    try {
      const id = await heldSince(m.id, 10 * 60_000);
      // "I could not ask" is not "nothing is recording". Guessing here would take the card away
      // from a live meeting every time the STT service restarted.
      process.env.STT_INTERNAL_URL = "http://127.0.0.1:59997";
      expect(await sweepStaleRecordings()).toBe(0);
      expect(await status(id)).toBe("running");
    } finally {
      await prisma.job.deleteMany({ where: { meetingId: m.id } });
      await prisma.meeting.delete({ where: { id: m.id } });
    }
  });
});
