import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Every sentence in a confirmation dialog goes through t().
//
// tests/i18n.test.ts checks that each t("…") key has a Japanese row, and so it cannot see a string
// that was never passed to t() at all. The dialogs were where most of those turned up: a title or
// a message written as a plain literal, or two literals joined, reads as English on a Japanese
// screen and fails no test. A literal in one of these fields is what this catches.

const root = join(__dirname, "..");

function tsx(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next") continue;
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) tsx(p, out);
    else if (p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

describe("confirmation dialogs", () => {
  it("pass every shown field through t()", () => {
    const offenders: string[] = [];
    for (const file of tsx(join(root, "app"))) {
      const src = readFileSync(file, "utf8");
      for (const call of src.matchAll(/\bconfirm\(\{([\s\S]*?)\}\)/g)) {
        const body = call[1];
        for (const m of body.matchAll(/\b(title|message|confirmLabel|cancelLabel|checkboxLabel)\s*:\s*(["'`])/g)) {
          const line = src.slice(0, call.index! + 9 + m.index!).split("\n").length;
          offenders.push(`${file.slice(root.length + 1)}:${line} ${m[1]}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
