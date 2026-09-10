import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Where a full page load is deliberate, and where it would be a mistake.
//
// Signing in, signing out, signing out everywhere and the first account being created all
// change what this browser is allowed to see. `router.push()` cannot express that: it keeps the
// router cache and the server components already rendered against the *previous* answer, and
// `proxy.ts` — the gate that decides — never runs again. So those places assign
// `window.location.href` on purpose.
//
// Next's own rule says not to, which is right everywhere else, so it is off in
// `eslint.config.mjs`. This is what it was actually guarding: the list of files allowed to do
// it. Somewhere new reaching for `location.href` is almost certainly an ordinary navigation
// that should be `router.push()`, and it fails here instead of passing quietly.

const root = join(__dirname, "..");

const ALLOWED = [
  "app/account-menu.tsx", // sign out
  "app/account/account-form.tsx", // sign out everywhere
  "app/login/login-form.tsx", // sign in
  "app/reset/[token]/reset-form.tsx", // a password set from a link — signed in from here
  "app/setup/setup-form.tsx", // the first account, signed in as it is created
];

function tsxFiles(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(join(root, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) tsxFiles(rel, out);
    else if (e.name.endsWith(".tsx") || e.name.endsWith(".ts")) out.push(rel);
  }
  return out;
}

const ASSIGNS = /\blocation\s*\.\s*(?:href\s*=|assign\s*\()/;

describe("a full page load after the session changes", () => {
  it("happens only where the session changed", () => {
    const offenders = tsxFiles("app")
      .filter((f) => !ALLOWED.includes(f))
      .filter((f) => {
        const src = readFileSync(join(root, f), "utf8")
          .replace(/\/\*[\s\S]*?\*\//g, "")
          .replace(/^\s*\/\/.*$/gm, "");
        return ASSIGNS.test(src);
      });
    // If this fails: is the new one an authentication change? If yes, add the file here with a
    // note saying which change. If no, it wants `useRouter().push()`.
    expect(offenders).toEqual([]);
  });

  it("keeps every allowed file actually doing it", () => {
    // The other direction: a file that stops needing a reload should leave the list, or the
    // list stops meaning anything.
    const idle = ALLOWED.filter(
      (f) => !ASSIGNS.test(readFileSync(join(root, f), "utf8")),
    );
    expect(idle).toEqual([]);
  });

  it("says why, at each of them", () => {
    // The rule is off, so the reason has to be readable where somebody would otherwise
    // "correct" the code.
    for (const f of ALLOWED) {
      const src = readFileSync(join(root, f), "utf8");
      expect(src, `${f} assigns location.href without saying why`).toMatch(
        /proxy|middleware|re-evaluate|signed in|session/i,
      );
    }
  });
});
