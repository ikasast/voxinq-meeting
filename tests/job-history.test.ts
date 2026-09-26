import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { asSystem } from "../lib/db/scope";
import { formatSpanIn } from "../lib/i18n/format";
import { addOllamaUsage, emptyUsage } from "../lib/llm/types";
import { prisma } from "../lib/prisma";
import { gpuShare, tokensPerSecond } from "../lib/queue/metrics";
import { enqueue, finish, recentJobsAcrossUsers } from "../lib/queue/queue";

// Looking back at what the queue did: how long each piece took, on what, and whether the model
// fitted on the card. The question behind it is usually "why was that one slow", and the answer
// is usually a model half on the CPU — so that is measured, not guessed.

const read = (p: string) => readFileSync(join(__dirname, "..", p), "utf8");

describe("what an LLM run cost", () => {
  it("adds up Ollama's closing figures over every call, condensing included", () => {
    const u = emptyUsage();
    // Nanoseconds, as Ollama reports them.
    addOllamaUsage(u, { prompt_eval_count: 9000, eval_count: 400, eval_duration: 10e9, prompt_eval_duration: 2e9, load_duration: 3e9 });
    addOllamaUsage(u, { prompt_eval_count: 1200, eval_count: 800, eval_duration: 20e9 });
    expect(u).toMatchObject({
      inputTokens: 10200,
      outputTokens: 1200,
      generateMs: 30000,
      promptMs: 2000,
      loadMs: 3000,
    });
  });

  it("is counted by every provider and threaded through the whole run", () => {
    expect(read("lib/llm/ollama.ts")).toContain("addOllamaUsage(cfg.usage, chunk)");
    expect(read("lib/llm/anthropic.ts")).toContain("res.usage?.input_tokens");
    expect(read("lib/llm/openai.ts")).toContain("cfg.usage.calls += 1");
    // On the config, so the condensing calls are counted as well as the writing one.
    expect(read("lib/llm/index.ts")).toContain("if (opts?.usage) cfg.usage = opts.usage;");
  });
});

describe("the figures shown", () => {
  it("say how much of the model sat on the GPU", () => {
    expect(gpuShare({ loadedMb: 7577, gpuMb: 6364 })).toBeCloseTo(0.84, 2);
    expect(gpuShare({ loadedMb: 5600, gpuMb: 5600 })).toBe(1);
    // Not known is not zero.
    expect(gpuShare({ model: "x" })).toBeNull();
    expect(gpuShare(null)).toBeNull();
  });

  it("say how fast the answer was written", () => {
    expect(tokensPerSecond({ outputTokens: 1200, generateMs: 30000 })).toBe(40);
    expect(tokensPerSecond({ outputTokens: 1200 })).toBeNull();
  });

  it("keep the seconds for how long work took", () => {
    expect(formatSpanIn("ja", 108_000)).toBe("1分48秒");
    expect(formatSpanIn("ja", 48_000)).toBe("48秒");
    expect(formatSpanIn("en", 108_000)).toBe("1 min 48 sec");
    expect(formatSpanIn("ja", 3_900_000)).toBe("1時間5分");
  });

  it("measure the GPU share when a minutes job ends, not from the estimate", () => {
    const minutes = read("lib/queue/runners/minutes.ts");
    expect(minutes).toContain("await loadedModel(");
    // Recorded for a failed run too: a model that did not fit is often why it failed.
    expect(minutes).toMatch(/return \{ aborted, reason, metrics: await measure\(\) \}/);
  });
});

// Against a real database: what finish() keeps, and who sees which rows.
const ENABLED = process.env.VOXINQ_QUEUE_DB_TESTS === "1";
const sys = <T>(fn: () => Promise<T>) => asSystem("job history tests", fn);

describe.skipIf(!ENABLED)("the history, from the database", () => {
  it("keeps what the run reported, and a stop from the screen does not wipe it", () =>
    sys(async () => {
      const { id } = await enqueue({ kind: "minutes", vramMb: 0 });
      try {
        await finish(id, "done", undefined, { model: "m:1b", loadedMb: 100, gpuMb: 100 });
        await finish(id, "cancelled", "Stopped.");
        const row = await prisma.job.findUniqueOrThrow({ where: { id } });
        expect(row.metrics).toMatchObject({ model: "m:1b", gpuMb: 100 });
      } finally {
        await prisma.job.delete({ where: { id } });
      }
    }));

  it("shows a person their own work, and an administrator everybody's without the meeting", () =>
    sys(async () => {
      const [a, b] = await Promise.all([
        prisma.user.create({ data: { username: "jh-a", email: "jh-a@example.test", name: "A" }, select: { id: true } }),
        prisma.user.create({ data: { username: "jh-b", email: "jh-b@example.test", name: "B" }, select: { id: true } }),
      ]);
      const mtg = await prisma.meeting.create({
        data: { title: "B's meeting", startedAt: new Date(Date.now() - 3_600_000), endedAt: new Date(), ownerId: b.id },
        select: { id: true },
      });
      const job = await prisma.job.create({
        data: {
          kind: "minutes",
          status: "error",
          meetingId: mtg.id,
          ownerId: b.id,
          detail: "something about B's meeting",
          startedAt: new Date(Date.now() - 60_000),
          finishedAt: new Date(),
          metrics: { model: "m:1b" },
        },
        select: { id: true },
      });
      try {
        // B sees it, with the meeting.
        const mine = (await recentJobsAcrossUsers({ id: b.id, isAdmin: false })).find((r) => r.id === job.id);
        expect(mine?.title).toBe("B's meeting");
        expect(mine?.meetingMs).toBe(3_600_000);
        expect(mine?.detail).toContain("B's meeting");

        // A, not an administrator, does not see it at all.
        const others = await recentJobsAcrossUsers({ id: a.id, isAdmin: false });
        expect(others.find((r) => r.id === job.id)).toBeUndefined();

        // A as an administrator sees that it ran and on what — never which meeting.
        const admin = (await recentJobsAcrossUsers({ id: a.id, isAdmin: true })).find((r) => r.id === job.id);
        expect(admin).toBeDefined();
        expect(admin?.metrics).toMatchObject({ model: "m:1b" });
        expect(admin?.title).toBeNull();
        expect(admin?.meetingId).toBeNull();
        expect(admin?.meetingMs).toBeNull();
        expect(admin?.detail).toBeNull();
      } finally {
        await prisma.job.delete({ where: { id: job.id } });
        await prisma.meeting.delete({ where: { id: mtg.id } });
        await prisma.user.deleteMany({ where: { id: { in: [a.id, b.id] } } });
      }
    }));
});
