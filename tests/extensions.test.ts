import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EXTENSION_IDS, resolveExtensions } from "@/lib/extensions";

// Extensions: parts of the app an administrator switches on or off for the whole instance.

const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

function sources(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(join(root, d), { withFileTypes: true })) {
      const rel = `${d}/${e.name}`;
      if (e.isDirectory()) walk(rel);
      else if (/\.tsx?$/.test(e.name)) out.push(read(rel));
    }
  };
  walk(dir);
  return out;
}

describe("the stored state", () => {
  it("is everything on when nothing was stored, as 3.x was", () => {
    for (const on of Object.values(resolveExtensions(null))) expect(on).toBe(true);
  });

  it("keeps what was switched off, and ignores what it does not know", () => {
    const s = resolveExtensions({ ask: false, translation: "no", somethingElse: false });
    expect(s.ask).toBe(false);
    expect(s.translation).toBe(true);
    expect(Object.keys(s).sort()).toEqual([...EXTENSION_IDS].sort());
  });
});

describe("every extension listed", () => {
  const app = sources("app").join("\n");

  it.each(EXTENSION_IDS)("%s is gated somewhere, so switching it off does something", (id) => {
    // Listed but not gated would be a switch that changes nothing.
    const gated = [`extensionOff("${id}")`, `extensionEnabled("${id}")`, `extensions.${id}`].some((g) =>
      app.includes(g),
    );
    expect(gated).toBe(true);
  });

  it.each(EXTENSION_IDS)("%s has words on the Extensions tab", (id) => {
    expect(read("app/settings/extensions-settings.tsx")).toContain(`    ${id}: {`);
  });

  it.each(EXTENSION_IDS)("%s has a picture in both languages", (id) => {
    // Missing, the details dialog quietly shows none; retake them with
    // scripts/shoot-extension-shots.mjs (docs/screenshots/README.md).
    for (const locale of ["en", "ja"]) {
      expect(existsSync(join(root, "public", "extension-shots", locale, `${id}.webp`))).toBe(true);
    }
  });
});

describe("switching", () => {
  it("is for an administrator only", () => {
    const route = read("app/api/extensions/route.ts");
    expect(route).toContain("if (me && !me.isAdmin)");
  });

  it("keeps the person's translation choice while translation is off", () => {
    // Reported as off, but a save from the settings screen must not overwrite what they chose.
    const route = read("app/api/settings/route.ts");
    expect(route).toContain('typeof body.sttTranslate === "boolean" && (await extensionEnabled("translation"))');
  });

  it("reaches every page through the layout", () => {
    expect(read("app/layout.tsx")).toContain("<ExtensionsProvider value={await readExtensions()}>");
  });
});
