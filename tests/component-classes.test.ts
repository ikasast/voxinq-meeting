import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// The button styles are project classes in globals.css, not Tailwind utilities, so a typo
// produces no error anywhere — the element simply renders unstyled. That shipped once:
// `btn btn-primary` on the backup buttons looked like plain text in Settings until someone
// noticed. Tailwind's own utilities are checked by the compiler; these are not, so check them
// here.
const ROOT = path.join(__dirname, "..");
const PREFIXES = ["btn"];

function definedClasses(): Set<string> {
  const css = readFileSync(path.join(ROOT, "app", "globals.css"), "utf8");
  return new Set(Array.from(css.matchAll(/\.([a-z][a-z0-9-]*)/g), (m) => m[1]));
}

function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next") continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...tsxFiles(full));
    else if (entry.endsWith(".tsx")) out.push(full);
  }
  return out;
}

/** Class tokens used in a file that look like one of ours (`btn`, `btn-ink`, …). */
function usedClasses(source: string): string[] {
  const found = new Set<string>();
  for (const match of source.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
    for (const token of (match[1] ?? match[2] ?? "").split(/\s+/)) {
      const name = token.trim();
      if (PREFIXES.some((p) => name === p || name.startsWith(`${p}-`))) found.add(name);
    }
  }
  return [...found];
}

describe("component classes", () => {
  it("every btn class used in a component exists in globals.css", () => {
    const defined = definedClasses();
    const missing: string[] = [];

    for (const file of tsxFiles(path.join(ROOT, "app"))) {
      for (const name of usedClasses(readFileSync(file, "utf8"))) {
        if (!defined.has(name)) missing.push(`${path.relative(ROOT, file)}: ${name}`);
      }
    }

    expect(missing).toEqual([]);
  });

  it("recognises a class that is not defined", () => {
    // Guards the guard: if the scan silently stopped matching, the test above would pass on
    // anything.
    expect(usedClasses('<button className="btn btn-primary">')).toEqual(["btn", "btn-primary"]);
    expect(definedClasses().has("btn-primary")).toBe(false);
    expect(definedClasses().has("btn-ink")).toBe(true);
  });
});
