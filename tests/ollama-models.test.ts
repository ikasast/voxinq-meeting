import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  findInstalled,
  foldProgress,
  isModelName,
  ollamaBase,
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

  it("offers the button only to an administrator", () => {
    const field = read("app/settings/ollama-model-field.tsx");
    expect(field).toMatch(/\{isAdmin \? \(/);
    expect(read("app/settings/page.tsx")).toContain("isAdmin={settings.isAdmin}");
  });
});
