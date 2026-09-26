import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { asSystem } from "../lib/db/scope";
import { modelsInUse } from "../lib/llm/models-in-use";
import { prisma } from "../lib/prisma";
import {
  findInstalled,
  foldProgress,
  isModelName,
  loadedMb,
  ollamaBase,
  sameModel,
} from "../lib/llm/ollama-models";

// Choosing an Ollama model on the settings screen: what is installed, whether the name typed is
// among it, and fetching one that is not.

describe("a model name", () => {
  it("is what Ollama itself accepts", () => {
    for (const ok of [
      "qwen3:8b",
      "qwen3",
      "library/qwen3:8b",
      "hf.co/mmnga-o/NVIDIA-Nemotron-Nano-9B-v2-Japanese-gguf:Q4_K_M",
    ]) {
      expect(isModelName(ok), ok).toBe(true);
    }
  });

  it("is not a path, a URL or an option", () => {
    for (const bad of [
      "",
      " qwen3",
      "-rf",
      "../../etc/passwd",
      "http://example.test/model",
      "qwen3; rm -rf /",
      "a".repeat(201),
    ]) {
      expect(isModelName(bad), bad).toBe(false);
    }
  });
});

describe("the address asked", () => {
  it("is http or https, without a trailing slash", () => {
    expect(ollamaBase("http://ollama:11434/")).toBe("http://ollama:11434");
    expect(ollamaBase("https://gpu.example.test")).toBe("https://gpu.example.test");
  });

  it("is refused before a request when it is anything else", () => {
    expect(ollamaBase("file:///etc/passwd")).toBeNull();
    expect(ollamaBase("not an address")).toBeNull();
  });
});

describe("whether a model is installed", () => {
  const installed = [
    { name: "qwen3:8b", sizeMb: 5000 },
    { name: "llama3:latest", sizeMb: 4700 },
  ];

  it("resolves a name without a tag as :latest, as Ollama does", () => {
    expect(findInstalled(installed, "llama3")?.name).toBe("llama3:latest");
    expect(findInstalled(installed, "qwen3")).toBeNull();
  });

  it("matches the exact tag, and ignores stray spaces", () => {
    expect(findInstalled(installed, " qwen3:8b ")?.sizeMb).toBe(5000);
    expect(findInstalled(installed, "qwen3:14b")).toBeNull();
  });
});

describe("two names for one model", () => {
  it("treats a missing tag as :latest, both ways", () => {
    expect(sameModel("llama3", "llama3:latest")).toBe(true);
    expect(sameModel("llama3:latest", " llama3 ")).toBe(true);
    expect(sameModel("qwen3:8b", "qwen3:14b")).toBe(false);
    expect(sameModel("qwen3", "qwen3:8b")).toBe(false);
  });
});

describe("what a model occupies once loaded", () => {
  it("is the file plus room for the context", () => {
    // The Nemotron that prompted this: a 6.08 GiB file, 7.4 GB in `ollama ps` at a context of
    // 24576, against an 8 GB card's budget of 7.0 GiB.
    const file = Math.round(6.08 * 1024);
    expect(loadedMb(file) / 1024).toBeCloseTo(7.3, 1);
    expect(loadedMb(file)).toBeGreaterThan(8188 - 1024);
  });

  it("is the one figure the queue and the settings screen both use", () => {
    const read = (p: string) => readFileSync(join(__dirname, "..", p), "utf8");
    expect(read("lib/queue/capacity.ts")).toContain("loadedMb(");
    const field = read("app/settings/ollama-model-field.tsx");
    expect(field).toContain("loadedMb(hit.sizeMb)");
    // Compared, and shown: a warning about a number it does not print reads as a mistake.
    expect(field).toMatch(/need > budgetMb/);
    expect(field).not.toMatch(/sizeMb \* 1\.2/);
  });
});

describe("download progress", () => {
  it("adds up the layers rather than jumping back at each one", () => {
    const layers = new Map<string, { completed: number; total: number }>();
    foldProgress(layers, { status: "pulling manifest" });
    foldProgress(layers, { digest: "a", total: 1000, completed: 1000 });
    const mid = foldProgress(layers, { digest: "b", total: 50, completed: 10 });
    // A line for the second layer does not forget the first.
    expect(mid).toEqual({ completed: 1010, total: 1050 });
    const end = foldProgress(layers, { digest: "b", total: 50, completed: 50 });
    expect(end).toEqual({ completed: 1050, total: 1050 });
  });

  it("ignores lines without a layer", () => {
    const layers = new Map<string, { completed: number; total: number }>();
    expect(foldProgress(layers, { status: "verifying sha256 digest" })).toEqual({
      completed: 0,
      total: 0,
    });
  });
});

describe("who can do what", () => {
  const read = (p: string) => readFileSync(join(__dirname, "..", p), "utf8");

  it("lets only an administrator start a download", () => {
    // Gigabytes on the server's disk and its bandwidth for ten minutes belong to whoever runs
    // the machine, not to everyone who can pick a model for their own minutes.
    const pull = read("app/api/ollama/pull/route.ts");
    expect(pull).toMatch(/if \(me && !me\.isAdmin\)/);
    expect(pull).toContain("isModelName(model)");
  });

  it("asks by POST, which a visitor from outside cannot send", () => {
    // Otherwise the list and the progress would let a read-only visitor make this server
    // probe addresses of their choosing.
    for (const p of [
      "app/api/ollama/models/route.ts",
      "app/api/ollama/pull/route.ts",
      "app/api/ollama/pull/status/route.ts",
    ]) {
      const src = read(p);
      expect(src, p).toContain("export async function POST");
      expect(src, p).not.toContain("export async function GET");
    }
  });

  it("lets only an administrator delete, and never a model in use", () => {
    const del = read("app/api/ollama/delete/route.ts");
    expect(del).toMatch(/if \(me && !me\.isAdmin\)/);
    expect(del).toContain("isModelName(model)");
    // In use means anybody's: the machine's default or one person's own choice. Deleting it
    // would not fail here but later, for someone else, as minutes that never come.
    expect(del).toMatch(/\(await modelsInUse\(\)\)\.some\(\(m\) => sameModel\(m, model\)\)/);
    // Nor one still arriving.
    expect(del).toContain("pullState(base, model)");
    expect(del).toContain("export async function POST");
    expect(del).not.toContain("export async function GET");
  });

  it("says which models are in use only to whoever can delete", () => {
    const list = read("app/api/ollama/models/route.ts");
    expect(list).toContain("inUse: admin ? await modelsInUse() : []");
  });

  it("counts every account's choice as well as the machine's", () => {
    const use = read("lib/llm/models-in-use.ts");
    expect(use).toContain("readMachineSettings()");
    expect(use).toContain("prisma.user.findMany");
    // Across accounts by saying so, not by stepping around the scoping.
    expect(use).toContain("asSystem(");
    expect(use).not.toContain("prismaRaw");
  });

  it("keeps the database out of what the browser loads", () => {
    // The field imports the name helpers; the in-use list reads every account and must stay
    // on the server.
    const shared = read("lib/llm/ollama-models.ts");
    expect(shared).not.toMatch(/from "@\/lib\/(prisma|prisma-raw|settings|db\/scope)"/);
    const field = read("app/settings/ollama-model-field.tsx");
    expect(field).not.toContain("models-in-use");
  });

  it("offers the button only to an administrator", () => {
    const field = read("app/settings/ollama-model-field.tsx");
    expect(field).toMatch(/\{isAdmin \? \(/);
    expect(read("app/settings/page.tsx")).toContain("isAdmin={settings.isAdmin}");
  });
});

// Against a real database, because the part that can go wrong is the database's: whether the
// scoped client lets this read every account at all. Opt-in for the same reason as the queue's
// tests — it writes users into whatever DATABASE_URL names.
describe.skipIf(process.env.VOXINQ_QUEUE_DB_TESTS !== "1")("models in use, from the database", () => {
  it("counts the machine's default and each account's own choice", async () => {
    const made = await asSystem("ollama model tests make accounts", () =>
      Promise.all([
        prisma.user.create({
          data: { username: "om-a", email: "om-a@example.test", name: "A", settings: { ollamaModel: "picked-by-a:1b" } },
          select: { id: true },
        }),
        prisma.user.create({
          data: { username: "om-b", email: "om-b@example.test", name: "B", settings: {} },
          select: { id: true },
        }),
      ]),
    );
    try {
      const names = await modelsInUse();
      expect(names).toContain("picked-by-a:1b");
      // B chose nothing, so B uses the machine's default — which is in the list either way.
      expect(names.length).toBeGreaterThanOrEqual(2);
    } finally {
      await asSystem("ollama model tests make accounts", () =>
        prisma.user.deleteMany({ where: { id: { in: made.map((u) => u.id) } } }),
      );
    }
  });
});
