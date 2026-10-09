import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The way to a recording on a phone. It was a bottom bar with one big Record now; since v4 the
// home screen is the start of everything (home-start.tsx), and the phone's top bar has a + that
// leads there. Each of these is a property that would fail quietly — a control that only ever
// 403s, or an offer on a screen where nobody is identified yet.

const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");
const home = read("app/home-start.tsx");
const bar = read("app/sidebar.tsx");

describe("starting a recording on a phone", () => {
  it("is one tap from the home screen, and says so in words", () => {
    // A microphone alone reads as "audio", not "start recording now".
    expect(home).toContain('href="/quick-record"');
    expect(home).toContain('t("Record now")');
  });

  it("is not offered to somebody who cannot record", () => {
    // Recording is refused server-side from outside the tailnet. The tile stays, greyed, and
    // says where it works instead.
    const at = home.indexOf('href="/quick-record"');
    expect(home.slice(home.lastIndexOf("{external ? (", at), at)).toContain("disabled");
  });

  it("stays off the screens where nobody is identified yet", () => {
    expect(bar).toContain("if (isAuthPath(pathname)) return null;");
    const paths = read("app/auth-paths.ts");
    expect(paths).toContain(String.raw`/^\/login$/`);
    expect(paths).toContain(String.raw`/^\/setup$/`);
    expect(paths).toContain(String.raw`/^\/reset\//`);
  });

  it("has the phone's top bar lead to it", () => {
    // The + in the bar is New meeting, and New meeting is the home screen with its three tiles.
    const top = bar.slice(bar.indexOf("A phone: the bar along the top"), bar.indexOf("{drawer ? ("));
    expect(top).toContain('title={t("New meeting")}');
    expect(top).toContain('href="/"');
  });
});
