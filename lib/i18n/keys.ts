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
const CALL = /(?<![\w.$])t\(\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')/g;

/**
 * `t(n === 1 ? "one" : "many", …)`, which is how this app writes a plural.
 *
 * English agrees and Japanese does not, so the choice is made at the call site and both forms
 * are keys. A scanner that only understood a literal first argument reported both of them as
 * missing from the table while they sat in it — which reads as a broken translation when
 * nothing is.
 *
 * The condition may run over several lines — prettier breaks one as soon as the sentences are
 * long — so newlines are allowed in it. Parentheses are not: without that, the condition could
 * run past the end of this call and pick up the next one's strings.
 */
const TERNARY =
  /(?<![\w.$])t\(\s*[^"'()]{0,300}\?\s*"((?:[^"\\]|\\.)*)"\s*:\s*"((?:[^"\\]|\\.)*)"/g;

/**
 * Comments go first — but only real ones.
 *
 * A regex over `/* … *\/` is not enough, and the way it fails is silent. This file contains
 * `accept="audio/*,video/*"`, whose slash-star starts a comment that never began and runs to the
 * next star-slash — two and a half thousand characters of real JSX, including four `t()` calls,
 * removed from what the scanner could see. The table then reported those four translations as
 * rows for strings nothing shows, which is one step away from somebody deleting them.
 *
 * So this walks the source instead, and knows when it is inside a string. Strings are kept: the
 * keys are in them.
 */
const REGEX_CAN_START = /^$|[=(,:[!&|?{};+\-*%<>~^]/;

function withoutComments(src: string): string {
  let out = "";
  let i = 0;
  // The last character that was not whitespace, which is how a regex literal is told from a
  // division: `/` after a value divides, `/` after an operator or a bracket opens a pattern.
  let lastMeaningful = "";
  while (i < src.length) {
    const c = src[i];
    const next = src[i + 1];
    if (c === "/" && next === "/") {
      while (i < src.length && src[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && next === "*") {
      i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    // A regex literal, whose quotes are not string quotes. This file's own CALL pattern
    // contains one, and without this the scanner entered string mode there, lost track of where
    // it was, and stopped recognising the doc comment below it as a comment — so the example
    // inside it became two keys nothing shows.
    // `/>` closes a JSX tag; `/>/` is a regex nobody writes. Without this exception a
    // self-closing element started a regex literal that ran to the next slash in the file,
    // taking whatever `t()` calls were between them with it — which is how `t("waiting")`,
    // sitting one character after `<Elapsed … />`, became a translation nothing could reach.
    if (c === "/" && src[i + 1] !== ">" && REGEX_CAN_START.test(lastMeaningful)) {
      out += c;
      i++;
      let inClass = false;
      while (i < src.length) {
        const r = src[i];
        if (r === "\\") {
          i += 2;
          continue;
        }
        if (r === "[") inClass = true;
        else if (r === "]") inClass = false;
        else if (r === "/" && !inClass) break;
        else if (r === "\n") break;
        i++;
      }
      i++;
      lastMeaningful = "/";
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      out += c;
      i++;
      while (i < src.length && src[i] !== quote) {
        if (src[i] === "\\") {
          out += src[i] + (src[i + 1] ?? "");
          i += 2;
          continue;
        }
        out += src[i];
        i++;
      }
      out += quote;
      i++;
      continue;
    }
    if (!/\s/.test(c)) lastMeaningful = c;
    out += c;
    i++;
  }
  return out;
}

export function keysIn(source: string): string[] {
  const clean = withoutComments(source);
  const unescape = (v: string) => v.replace(/\\(.)/g, "$1");
  return [
    ...[...clean.matchAll(CALL)].map((m) => unescape(m[1] ?? m[2])),
    ...[...clean.matchAll(TERNARY)].flatMap((m) => [unescape(m[1]), unescape(m[2])]),
  ];
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

/**
 * Every key the app uses, across app/ and lib/, in the order they were first seen.
 *
 * Plus the server messages, which are keys without being `t()` calls: they live at their call
 * sites in forty routes and are translated inside `apiError`, so this is where the table's test
 * gets to see them.
 */
export function allKeys(root: string): string[] {
  const seen = new Set<string>();
  for (const f of [...sourceFiles(root, "app"), ...sourceFiles(root, "lib")]) {
    for (const k of keysIn(readFileSync(join(root, f), "utf8"))) seen.add(k);
  }
  for (const k of serverMessageKeys(root)) seen.add(k);
  return [...seen];
}

/** The quoted strings in `SERVER_MESSAGES`, read as text so this file needs no build step. */
export function serverMessageKeys(root: string): string[] {
  const src = readFileSync(join(root, "lib/i18n/server-messages.ts"), "utf8");
  const body = src.slice(src.indexOf("SERVER_MESSAGES = ["), src.indexOf("] as const"));
  return [...body.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1].replace(/\\(.)/g, "$1"));
}
