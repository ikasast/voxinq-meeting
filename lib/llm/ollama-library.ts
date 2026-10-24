// Finding a model in Ollama's library, for the settings screen.
//
// Downloading a model needs its exact name — `gemma4:e4b`, not "Gemma 4" — and the only place
// that lists the names is ollama.com. It has no search API, so this reads the two pages a person
// would: the search results, and a model's list of tags. When the site changes its markup the
// search finds nothing and says so; typing the name keeps working, because nothing else depends
// on this.
//
// Asked only when an administrator presses Search, and only of ollama.com, which is where the
// download itself comes from. A server that cannot reach the internet cannot search — or
// download — and is told that rather than shown an empty list.

const SITE = "https://ollama.com";
const TIMEOUT_MS = 8000;

export type LibraryModel = {
  /** The name to pull: `gemma4`. Only Ollama's own models — `library/…` — are listed. */
  name: string;
  description: string;
  /** The sizes the search page shows: `e4b`, `12b`. */
  sizes: string[];
  /** What it can do besides text: `vision`, `tools`, `thinking`, `audio`. */
  capabilities: string[];
};

export type LibraryTag = {
  /** `gemma4:e4b` — what goes in the model field. */
  name: string;
  /** The download, in MB (MiB, as the rest of the app counts them). */
  sizeMb: number;
  /** The context window, in tokens, when the page says. */
  contextTokens: number | null;
  /** A size of its own (`e4b`), rather than another quantisation of one (`e4b-it-q8_0`). */
  main: boolean;
};

/** Why a search returned nothing to show. */
export type LibraryError = "unreachable" | "unreadable";

const strip = (s: string) =>
  s
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();

/** `e4b`, `0.6b`, `270m`, `27b` — a size chip, as against `vision` or `tools`. */
const SIZE = /^(?:e?\d+(?:\.\d+)?[bm]|\d+x\d+b)$/i;
/** Capabilities that mean it cannot write minutes at all. */
const NOT_TEXT = new Set(["embedding"]);

/**
 * The models on a search page, Ollama's own only.
 *
 * Anybody can publish a model under their own name, and a search for a popular family is mostly
 * those — uncensored, merged, renamed. They can still be typed into the field; listing them here
 * would make the screen look as if it recommended them.
 *
 * Left out too: models that only run on Ollama's servers (`cloud` with no size to download), and
 * embedding models, which turn text into numbers and cannot write anything.
 */
export function parseSearch(html: string): LibraryModel[] {
  const out: LibraryModel[] = [];
  for (const item of html.split(/<li\s[^>]*class="border-b[^"]*"[^>]*>/).slice(1)) {
    const body = item.split("</li>")[0];
    const href = body.match(/<a\s[^>]*href="\/library\/([A-Za-z0-9._-]+)"/);
    if (!href) continue;
    const name = href[1];
    const desc = body.match(/<p\s[^>]*title="([^"]*)"/);
    const chips = [...body.matchAll(/<span\s[^>]*rounded-md[^>]*>([\s\S]*?)<\/span>/g)].map((m) => strip(m[1]));
    const sizes = chips.filter((c) => SIZE.test(c));
    // Words only: a chip can hold a tooltip (the price of the cloud version), which is not one.
    const capabilities = chips.filter((c) => !SIZE.test(c) && c !== "cloud" && /^[a-z][a-z-]*$/.test(c));
    if (sizes.length === 0) continue;
    if (capabilities.some((c) => NOT_TEXT.has(c))) continue;
    out.push({ name, description: desc ? strip(desc[1]) : "", sizes, capabilities });
  }
  return out;
}

/** `6.6GB` → MiB. The site counts in decimal gigabytes; Ollama's own list in binary. */
function toMb(text: string): number | null {
  const m = text.match(/([\d.]+)\s*(GB|MB|KB)/i);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  const bytes = n * (m[2].toUpperCase() === "GB" ? 1e9 : m[2].toUpperCase() === "MB" ? 1e6 : 1e3);
  return Math.round(bytes / 1024 / 1024);
}

/**
 * A model's tags, from its tags page.
 *
 * Each tag's line reads `<digest> • 6.6GB • 128K context window • …`. A tag that names a size
 * (`e4b`) can stand for a different download on each kind of machine — 4-bit GGUF for a GPU, MLX
 * on a Mac — and then its line gives the range. What an Ollama on an NVIDIA card or a CPU pulls
 * is the 4-bit GGUF, so the size is that quantisation's own when the page lists it
 * (`e4b-it-q4_K_M`), and the bottom of the range when it does not.
 * Left out: `latest`, which is another name for one of the others; `cloud` tags, which run on
 * Ollama's servers rather than this one; and `mlx` tags, which are for Apple's chips and not
 * what an Ollama on Linux or Windows runs.
 */
export function parseTags(html: string, model: string): LibraryTag[] {
  type Line = { name: string; tag: string; sizes: number[]; ctx: number | null };
  const lines = new Map<string, Line>();
  const esc = model.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const anchor = new RegExp(`<a\\s[^>]*href="/library/(${esc}:[A-Za-z0-9._-]+)"[^>]*>([\\s\\S]*?)</a>`, "g");
  for (const m of html.matchAll(anchor)) {
    const name = m[1];
    if (lines.has(name)) continue;
    const text = strip(m[2]);
    const parts = text.split("•").map((p) => p.trim());
    const sizes = (parts.find((p) => /\d\s*[GMK]B/i.test(p)) ?? "")
      .split(/\s+-\s+/)
      .map(toMb)
      .filter((n): n is number => n !== null);
    if (sizes.length === 0) continue;
    const ctx = text.match(/([\d.]+)\s*K\s+context/i);
    lines.set(name, {
      name,
      tag: name.slice(model.length + 1),
      sizes,
      ctx: ctx ? Math.round(Number(ctx[1]) * 1024) : null,
    });
  }

  const q4 = (tag: string) =>
    [`${tag}-it-q4_K_M`, `${tag}-q4_K_M`, `${tag}-instruct-q4_K_M`]
      .map((t) => lines.get(`${model}:${t}`))
      .find((l) => l && l.sizes.length === 1)?.sizes[0];

  const out: LibraryTag[] = [];
  for (const l of lines.values()) {
    if (l.tag === "latest" || /(^|-)cloud$/.test(l.tag) || /(^|-)mlx(-|$)/.test(l.tag)) continue;
    const sizeMb = l.sizes.length === 1 ? l.sizes[0] : (q4(l.tag) ?? Math.min(...l.sizes));
    out.push({ name: l.name, sizeMb, contextTokens: l.ctx, main: !l.tag.includes("-") });
  }
  return out.sort((a, b) => Number(b.main) - Number(a.main) || a.sizeMb - b.sizeMb);
}

/** Whether a model of this size sits on this machine's card, before it has ever been loaded. */
export type Fit = "fits" | "tight" | "partial" | "too-big";

/**
 * An estimate from the download size alone — the same fifth on top that the queue prices a model
 * with (`loadedMb`). The weights fitting but not the context is "tight": it may run on the GPU
 * alone or spill a little. Up to twice the budget part of it runs on the CPU; beyond that, so
 * much does that minutes would take most of an hour.
 */
export function fitFor(sizeMb: number, budgetMb: number): Fit {
  if (Math.round(sizeMb * 1.2) <= budgetMb) return "fits";
  if (sizeMb <= budgetMb) return "tight";
  if (sizeMb <= budgetMb * 2) return "partial";
  return "too-big";
}

async function page(path: string): Promise<{ html: string } | { error: LibraryError }> {
  let res: Response;
  try {
    res = await fetch(`${SITE}${path}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { Accept: "text/html" },
    });
  } catch {
    return { error: "unreachable" };
  }
  if (!res.ok) return { error: res.status === 404 ? "unreadable" : "unreachable" };
  return { html: await res.text() };
}

export async function searchLibrary(query: string): Promise<{ models: LibraryModel[] } | { error: LibraryError }> {
  const r = await page(`/search?q=${encodeURIComponent(query)}`);
  if ("error" in r) return r;
  return { models: parseSearch(r.html) };
}

export async function libraryTags(model: string): Promise<{ tags: LibraryTag[] } | { error: LibraryError }> {
  const r = await page(`/library/${encodeURIComponent(model)}/tags`);
  if ("error" in r) return r;
  const tags = parseTags(r.html, model);
  if (tags.length === 0) return { error: "unreadable" };
  return { tags };
}
