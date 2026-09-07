import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// English left on the settings screen, which is where it kept being found.
//
// The key scanner reads `t("…")` calls, so a sentence that was never wrapped in one is not
// reported as missing — it is invisible. Three separate times a sentence here was split around
// `<strong>` or a link, one half wrapped and the other left as plain JSX text, and the screen
// read half in each language. Twice it was the warning about what leaves the machine.
//
// This looks for the other side of that: a run of English words sitting directly in the markup.
// It is a heuristic and it does not read every kind of string — an untranslated `title` on one
// element will still get through — but it catches the shape that keeps recurring.

const root = join(__dirname, "..");
const DIR = "app/settings";

// Content that is deliberately not prose. A model name is an identifier, and a sample of a
// date format is the answer to "which of these reads as a date to you".
const NOT_PROSE = [
  "qwen2.5:7b-instruct",
  "gemini-3.5-transcribe",
  "gemini-3.5-flash",
  "Jul 11, 2026",
  "Voxinq Meeting",
];

/** JSX text nodes, with comments and `<code>` samples removed. */
function bareText(src: string): string[] {
  const withoutComments = src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  const withoutCode = withoutComments.replace(/<code[^>]*>[\s\S]*?<\/code>/g, "<code/>");
  const out: string[] = [];
  // The `>` must close a tag, not be the tail of an arrow: `(p) => p.stale) ? (` is code.
  for (const m of withoutCode.matchAll(/(^|[^=])>\s*([A-Za-z][^<>{}\n]*?)\s*</g)) {
    const text = m[2].trim();
    // Three words or more: one or two is usually an identifier, a unit, or half a JSX
    // expression the regex tripped over.
    if (text.split(/\s+/).length < 3) continue;
    if (!/^[A-Za-z][A-Za-z0-9 ,.'’“”()\-—…/&:;!?]*$/.test(text)) continue;
    if (NOT_PROSE.some((n) => text.includes(n))) continue;
    out.push(text);
  }
  return out;
}

function filesIn(dir: string): string[] {
  return readdirSync(join(root, dir))
    .filter((f) => f.endsWith(".tsx"))
    .map((f) => `${dir}/${f}`);
}

describe("the settings screen speaks one language", () => {
  it.each(filesIn(DIR))("%s has no English sitting in the markup", (file) => {
    const found = bareText(readFileSync(join(root, file), "utf8"));
    // If this fails, the fix is `t("…")` around the sentence — the whole sentence. Splitting
    // one to keep a `<strong>` inside it is what caused every instance of this so far, because
    // the two halves then have to appear in that order and Japanese does not put them in it.
    expect(found).toEqual([]);
  });
});
