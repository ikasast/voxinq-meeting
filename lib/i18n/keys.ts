import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// Every string the app asks to be translated, found by reading the source.
//
// Shared between the test that fails on an untranslated key and the script that fills the table
// in, because two implementations of "which strings are a key" would eventually disagree — and
// the way that disagreement shows up is a sentence quietly reverting to English in front of
// somebody.

/**
 * `t("…")`, and only that.
 *
 * The lookbehind is load-bearing. Without it this also matches `get("…")`, `set("…")` and
 * `format("…")` — every identifier ending in t — which is how the first version decided that
 * "Content-Disposition" and "autostart" were user-facing prose.
 */
const CALL = /(?<![\w.$])t\(\s*"((?:[^"\\]|\\.)*)"/g;

/**
 * Comments go first.
 *
 * The examples in this module's own documentation are `t("Start recording")`, and a scanner
 * that cannot tell an example from a call puts phantom rows in the table — which then look
 * like translations somebody forgot to remove.
 */
function withoutComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

export function keysIn(source: string): string[] {
  return [...withoutComments(source).matchAll(CALL)].map((m) => m[1].replace(/\\"/g, String.fromCharCode(34)));
}

export function sourceFiles(root: string, dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(join(root, dir))) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const rel = dir + "/" + name;
    if (statSync(join(root, rel)).isDirectory()) sourceFiles(root, rel, out);
    else if (/\.tsx?$/.test(name)) out.push(rel);
  }
  return out;
}

/** Every key the app uses, across app/ and lib/, in the order they were first seen. */
export function allKeys(root: string): string[] {
  const seen = new Set<string>();
  for (const f of [...sourceFiles(root, "app"), ...sourceFiles(root, "lib")]) {
    for (const k of keysIn(readFileSync(join(root, f), "utf8"))) seen.add(k);
  }
  return [...seen];
}
