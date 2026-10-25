import { asSystem } from "@/lib/db/scope";
import { prisma } from "@/lib/prisma";
import { sameModel } from "@/lib/llm/ollama-models";
import type { JobMetrics } from "@/lib/queue/metrics";

// How each installed model actually sat on the card the last time it ran.
//
// The settings screen used to judge a model by its file alone — a fifth on top for the context,
// compared with the budget — and that is wrong in both directions. Gemma 4 E4B is a 6.1 GB file
// that Ollama holds in 4.9 GB, all on the GPU; it was shown as too big. What Ollama reports once
// it has loaded a model is the answer, and two places have it: the model loaded now, and the
// figures every set of minutes records when it finishes.
//
// Server-only: it reads the database, and `ollama-models.ts` is also read in the browser.

export type ModelRun = {
  name: string;
  /** What Ollama held, and how much of it on the GPU. Equal when none of it ran on the CPU. */
  loadedMb: number;
  gpuMb: number;
  /** "now" when it is loaded at this moment, otherwise when that set of minutes finished. */
  at: string;
};

/** Minutes jobs looked back over — enough for every model anybody has used lately. */
const RECENT = 200;

async function loadedNow(base: string): Promise<ModelRun[]> {
  try {
    const res = await fetch(`${base}/api/ps`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return [];
    const d = (await res.json()) as { models?: { name?: string; size?: number; size_vram?: number }[] };
    const mb = (b: number) => Math.round(b / 1024 / 1024);
    return (d.models ?? [])
      .filter((m) => typeof m.name === "string" && typeof m.size === "number" && m.size > 0)
      .map((m) => ({ name: m.name!, loadedMb: mb(m.size!), gpuMb: mb(m.size_vram ?? 0), at: "now" }));
  } catch {
    return [];
  }
}

/**
 * The latest run of each model: loaded now first, then the newest set of minutes.
 *
 * Only the share on the GPU is to be trusted from these. For some models Ollama's own total is
 * far below what the card shows in use — Gemma 4 E4B reports 0.36 GB while occupying 4.9 — so
 * the absolute figures are not a price for the queue, which keeps its estimate.
 */
export async function lastRuns(base: string): Promise<ModelRun[]> {
  const runs = await loadedNow(base);
  const jobs = await asSystem("how a model fitted is a fact about the machine, not anybody's meeting", () =>
    prisma.job.findMany({
      where: { kind: "minutes", status: "done" },
      orderBy: { finishedAt: "desc" },
      take: RECENT,
      select: { metrics: true, finishedAt: true },
    }),
  );
  for (const j of jobs) {
    const m = (j.metrics ?? {}) as JobMetrics;
    if (m.provider !== "ollama" || !m.model || !m.loadedMb || m.gpuMb === undefined) continue;
    if (runs.some((r) => sameModel(r.name, m.model!))) continue;
    runs.push({
      name: m.model,
      loadedMb: m.loadedMb,
      gpuMb: m.gpuMb,
      at: (j.finishedAt ?? new Date(0)).toISOString(),
    });
  }
  return runs;
}
