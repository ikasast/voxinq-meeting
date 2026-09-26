// What the Ollama in use has installed, and fetching one that it does not.
//
// Choosing a model used to mean typing its name and finding out whether it existed when the
// first set of minutes failed — and installing one meant a terminal on the server, which on a
// Docker install is `docker exec` into a container most people never think about. The settings
// screen can answer both now: which models are there, and (for an administrator) fetch one.
//
// A pull is minutes of download for a model of several gigabytes, so it is not tied to the
// request that asked for it. It runs here, in the server process, and the screen asks how far
// it has got. Closing the tab does not stop it; a restart of the server does, and then asking
// again resumes — Ollama keeps what it already has.

/** A name Ollama would accept: `qwen3:8b`, `library/qwen3`, `hf.co/owner/repo:Q4_K_M`. */
const MODEL_NAME = /^[A-Za-z0-9][A-Za-z0-9._\-/:]{0,199}$/;

export function isModelName(name: string): boolean {
  return MODEL_NAME.test(name) && !name.includes("..") && !name.includes("//");
}

/** Only an http(s) address is somewhere to ask; anything else is refused before a request. */
export function ollamaBase(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return url.replace(/\/+$/, "");
  } catch {
    return null;
  }
}

export type InstalledModel = { name: string; sizeMb: number };

/** Installed models, or null when Ollama cannot be reached. */
export async function listModels(base: string): Promise<InstalledModel[] | null> {
  try {
    const res = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const d = (await res.json()) as { models?: { name?: string; size?: number }[] };
    return (d.models ?? [])
      .filter((m): m is { name: string; size?: number } => typeof m.name === "string")
      .map((m) => ({ name: m.name, sizeMb: Math.round((m.size ?? 0) / 1024 / 1024) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return null;
  }
}

/**
 * Whether `wanted` is among `installed`, the way Ollama itself resolves a name: a name with no
 * tag means `:latest`.
 */
export function findInstalled(installed: InstalledModel[], wanted: string): InstalledModel | null {
  const withTag = (n: string) => (n.includes(":") && !n.endsWith(":") ? n : `${n.replace(/:$/, "")}:latest`);
  const want = withTag(wanted.trim());
  return installed.find((m) => withTag(m.name) === want) ?? null;
}

// ---- Pulling ----

export type PullState = {
  model: string;
  /** Ollama's own words for the step it is on: "pulling manifest", "verifying sha256 digest", … */
  status: string;
  completed: number;
  total: number;
  done: boolean;
  error: string | null;
  startedAt: number;
};

/**
 * One line of Ollama's pull stream folded into the running totals.
 *
 * A model is several layers, each reported on its own with its own `total` and `completed` —
 * the weights, the template, the licence. Summing the latest figure per layer is what makes one
 * progress bar out of them; taking the last line alone makes it jump back to zero at every
 * layer boundary.
 */
export function foldProgress(
  layers: Map<string, { completed: number; total: number }>,
  line: { status?: string; digest?: string; total?: number; completed?: number },
): { completed: number; total: number } {
  if (line.digest && typeof line.total === "number") {
    layers.set(line.digest, { total: line.total, completed: line.completed ?? 0 });
  }
  let completed = 0;
  let total = 0;
  for (const l of layers.values()) {
    completed += l.completed;
    total += l.total;
  }
  return { completed, total };
}

// Kept on globalThis so a hot reload in development does not lose a pull that is still running.
const g = globalThis as unknown as { __voxinqPulls?: Map<string, PullState> };
const pulls = (g.__voxinqPulls ??= new Map<string, PullState>());
const key = (base: string, model: string) => `${base}|${model}`;

export function pullState(base: string, model: string): PullState | null {
  return pulls.get(key(base, model)) ?? null;
}

/**
 * Start pulling `model` into the Ollama at `base`, unless it is already being pulled.
 * Returns straight away; the pull runs on and `pullState` reports it.
 */
export function startPull(base: string, model: string): { started: boolean; state: PullState } {
  const existing = pulls.get(key(base, model));
  if (existing && !existing.done) return { started: false, state: existing };

  const state: PullState = {
    model,
    status: "starting",
    completed: 0,
    total: 0,
    done: false,
    error: null,
    startedAt: Date.now(),
  };
  pulls.set(key(base, model), state);
  void runPull(base, model, state);
  return { started: true, state };
}

async function runPull(base: string, model: string, state: PullState): Promise<void> {
  const layers = new Map<string, { completed: number; total: number }>();
  try {
    // Streamed: Ollama reports each layer as it goes, and a non-streamed pull would say
    // nothing for the ten minutes a large model takes — long past any HTTP client's patience.
    const res = await fetch(`${base}/api/pull`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, stream: true }),
    });
    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => "");
      throw new Error(ollamaError(text) ?? `HTTP ${res.status}`);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const raw of lines) {
        if (!raw.trim()) continue;
        let line: { status?: string; digest?: string; total?: number; completed?: number; error?: string };
        try {
          line = JSON.parse(raw);
        } catch {
          continue;
        }
        if (line.error) throw new Error(line.error);
        if (line.status) state.status = line.status;
        const sum = foldProgress(layers, line);
        state.completed = sum.completed;
        state.total = sum.total;
        if (line.status === "success") {
          // The last layer's final figure is not always reported before "success"; the bar
          // should end full rather than a hair short.
          state.completed = state.total;
          state.done = true;
        }
      }
    }
    if (!state.done) throw new Error("the download ended before Ollama said it was complete");
  } catch (e) {
    state.error = e instanceof Error ? e.message : String(e);
    state.done = true;
  }
}

function ollamaError(text: string): string | null {
  try {
    const d = JSON.parse(text) as { error?: unknown };
    return typeof d.error === "string" ? d.error : null;
  } catch {
    return text.trim() ? text.trim().slice(0, 200) : null;
  }
}
