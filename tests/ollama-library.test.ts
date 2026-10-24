import { describe, expect, it } from "vitest";
import { fitFor, parseSearch, parseTags } from "../lib/llm/ollama-library";

// The two ollama.com pages, cut down to the shape the parser reads. Written by hand rather than
// saved from the site: the point is to pin what is relied on, so that a change on the site shows
// up as "these are the assumptions it broke".

const result = (href: string, desc: string, chips: string[]) => `
<li  class="border-b border-black/[0.08]">
  <a href="${href}" class="group flex items-start">
    <h2 title="x"><span>x</span></h2>
    <p class="mt-1 truncate" title="${desc}">${desc}</p>
    <div>${chips.map((c) => `<span class="inline-flex items-center rounded-md px-2">${c}</span>`).join(" ")}</div>
  </a>
</li>`;

describe("reading the search page", () => {
  const html = [
    result("/library/gemma4", "Gemma 4 models &amp; more", [
      `<span role="tooltip" class="rounded-md bg-black">Low usage $0.14 in</span>$`,
      "vision",
      "tools",
      "cloud",
      "e2b",
      "e4b",
      "12b",
    ]),
    result("/library/embeddinggemma", "Embeddings", ["embedding", "300m"]),
    result("/library/glm-flash", "Runs on Ollama's servers", ["vision", "cloud"]),
    result("/someone/gemma4-uncensored", "Not Ollama's", ["vision", "26b"]),
    result("/library/qwen3", "Qwen 3", ["tools", "thinking", "0.6b", "8b", "235b"]),
  ].join("");

  it("lists Ollama's own models with their sizes and what they can do", () => {
    expect(parseSearch(html)).toEqual([
      { name: "gemma4", description: "Gemma 4 models & more", sizes: ["e2b", "e4b", "12b"], capabilities: ["vision", "tools"] },
      { name: "qwen3", description: "Qwen 3", sizes: ["0.6b", "8b", "235b"], capabilities: ["tools", "thinking"] },
    ]);
  });

  it("leaves out embedding models, cloud-only models and other people's", () => {
    const names = parseSearch(html).map((m) => m.name);
    expect(names).not.toContain("embeddinggemma");
    expect(names).not.toContain("glm-flash");
    expect(names.some((n) => n.includes("uncensored"))).toBe(false);
  });

  it("finds nothing in a page of another shape, rather than something wrong", () => {
    expect(parseSearch("<html><body><div>redesigned</div></body></html>")).toEqual([]);
  });
});

const tag = (name: string, line: string) => `
<a href="/library/${name}" class="md:hidden flex flex-col">
  <span class="group-hover:underline">${name}</span>
  <span><span class="font-mono"> 0123456789ab</span> • ${line} • <span class="hidden sm:inline">Text input • 3 weeks ago</span></span>
</a>
<a href="/library/${name}" class="hidden md:flex">${name}</a>`;

describe("reading a model's tags", () => {
  const html = [
    tag("gemma4:latest", "6.6GB - 9.5GB • 128K context window"),
    tag("gemma4:cloud", "Low Usage • 256K context window"),
    tag("gemma4:e2b", "4.6GB - 7.5GB • 128K context window"),
    tag("gemma4:e4b", "6.6GB - 9.5GB • 128K context window"),
    tag("gemma4:12b", "7.7GB - 8.0GB • 256K context window"),
    tag("gemma4:e4b-it-q4_K_M", "6.6GB • 128K context window"),
    tag("gemma4:12b-it-q4_K_M", "8.0GB • 256K context window"),
    tag("gemma4:12b-it-q8_0", "13GB • 256K context window"),
    tag("gemma4:12b-mlx", "7.7GB • 256K context window"),
  ].join("");
  const tags = parseTags(html, "gemma4");
  const mb = (gb: number) => Math.round((gb * 1e9) / 1024 / 1024);

  it("lists each size, then the other quantisations, smallest first", () => {
    expect(tags.map((t) => [t.name, t.main])).toEqual([
      ["gemma4:e2b", true],
      ["gemma4:e4b", true],
      ["gemma4:12b", true],
      ["gemma4:e4b-it-q4_K_M", false],
      ["gemma4:12b-it-q4_K_M", false],
      ["gemma4:12b-it-q8_0", false],
    ]);
  });

  it("sizes a tag that stands for several downloads by the 4-bit one a GPU pulls", () => {
    // 12b's range starts at 7.7 GB, which is the Mac build; on an NVIDIA card it is 8.0.
    expect(tags.find((t) => t.name === "gemma4:12b")?.sizeMb).toBe(mb(8.0));
    expect(tags.find((t) => t.name === "gemma4:e4b")?.sizeMb).toBe(mb(6.6));
    // No 4-bit tag of its own listed: the bottom of the range.
    expect(tags.find((t) => t.name === "gemma4:e2b")?.sizeMb).toBe(mb(4.6));
  });

  it("leaves out latest, cloud and mlx", () => {
    const names = tags.map((t) => t.name);
    expect(names).not.toContain("gemma4:latest");
    expect(names).not.toContain("gemma4:cloud");
    expect(names).not.toContain("gemma4:12b-mlx");
  });

  it("reads the context window", () => {
    expect(tags.find((t) => t.name === "gemma4:12b")?.contextTokens).toBe(256 * 1024);
  });

  it("does not take another model's tags for this one's", () => {
    expect(parseTags(tag("gemma4n:e4b", "5GB • 32K context window"), "gemma4")).toEqual([]);
  });
});

describe("whether a download fits the card", () => {
  const budget = 7 * 1024;
  it("fits with room for the context", () => expect(fitFor(4400, budget)).toBe("fits"));
  it("is tight when the weights fit but the context may not", () => expect(fitFor(6300, budget)).toBe("tight"));
  it("runs partly on the CPU up to twice the budget", () => expect(fitFor(7600, budget)).toBe("partial"));
  it("is too big beyond that", () => expect(fitFor(15300, budget)).toBe("too-big"));
});
