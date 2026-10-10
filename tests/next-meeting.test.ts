import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// "New with same settings" copied a meeting's purpose, tags and series into a new one and started
// recording. What a recurring meeting carries forward is its series, so since v4 there is one way
// to the next one: the New meeting form, with the series filled in.

const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

describe("the next meeting in a series", () => {
  it("is reached from the meeting and from the series, both to the form", () => {
    expect(read("app/[id]/meeting-menu.tsx")).toContain("`/new?series=${encodeURIComponent(series)}`");
    expect(read("app/series/[id]/page.tsx")).toContain("`/new?series=${encodeURIComponent(series.name)}`");
    expect(() => read("app/[id]/clone-meeting-button.tsx")).toThrow();
  });

  it("arrives with the series filled in, blinking so a wrong one is seen", () => {
    const form = read("app/new/new-meeting-form.tsx");
    expect(form).toContain('useState(fromSeries ?? "")');
    expect(form).toContain('fromSeries ? "flash-pick" : ""');
    expect(read("app/globals.css")).toContain(".flash-pick {");
  });
});

describe("the meeting's own actions", () => {
  it("are icons from a tablet up, and behind '…' on a phone", () => {
    const menu = read("app/[id]/meeting-menu.tsx");
    expect(menu).toContain('className="hidden items-center gap-0.5 sm:inline-flex"');
    expect(menu).toContain('<span className="sm:hidden">');
  });
});
