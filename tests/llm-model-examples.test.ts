import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Settings, LLM: models to start from, by how much memory the card has. Each is Ollama's own name,
// so picking it fills the field and offers the download.

const field = readFileSync(join(__dirname, "..", "app/settings/ollama-model-field.tsx"), "utf8");

describe("the model examples", () => {
  it("are Ollama names, smallest first, and include the default", () => {
    const models = [...field.matchAll(/model: "([^"]+)"/g)].map((m) => m[1]);
    expect(models).toContain("qwen3:8b");
    for (const m of models) expect(m).toMatch(/^[a-z0-9.-]+:[a-z0-9.]+$/);
    const vram = [...field.matchAll(/vram: (?:t\("[^"]+"\)|"(\d+) GB")/g)].map((m) => Number(m[1] ?? 0));
    expect([...vram].sort((a, b) => a - b)).toEqual(vram);
  });

  it("fill the field when one is picked", () => {
    expect(field).toContain("onClick={() => onChange(s.model)}");
  });
});
