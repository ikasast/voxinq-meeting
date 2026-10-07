import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EXTENSION_IDS, resolveExtensions } from "@/lib/extensions";
import { keysKeptWhileOff, withExtensions } from "@/lib/extensions-settings";
import type { AppSettings } from "@/lib/settings";

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

  it("keeps the settings of one switched off, and saves do not overwrite them", () => {
    // Reported as unused to the screen, so a save from it would send the unused value back.
    const route = read("app/api/settings/route.ts");
    expect(route).toContain("for (const key of keysKeptWhileOff(extensions)) delete patch[key];");
  });

  it("reaches every page through the layout", () => {
    expect(read("app/layout.tsx")).toContain("<ExtensionsProvider value={extensions}>");
  });
});

describe("settings while an extension is off", () => {
  const stored = {
    sttTranslate: true,
    llmProvider: "anthropic",
    sttProfiles: [{ id: "p1", name: "Elsewhere", kind: "openai", baseUrl: "https://stt.example", model: "", apiKey: "k" }],
    sttDefaultProfileId: "p1",
    minutesTemplates: [{ id: "t1", name: "Weekly", body: "## Weekly", instructions: "" }],
    defaultMinutesTemplateId: "t1",
  } as unknown as AppSettings;
  const allOn = resolveExtensions(null);

  it("are what was stored while it is on", () => {
    expect(withExtensions(stored, allOn)).toEqual(stored);
    expect(keysKeptWhileOff(allOn)).toEqual([]);
  });

  it("read as Ollama and this machine without External AI", () => {
    const s = withExtensions(stored, { ...allOn, externalAi: false });
    expect(s.llmProvider).toBe("ollama");
    expect(s.sttProfiles).toEqual([]);
    expect(s.sttDefaultProfileId).toBe("");
    expect(s.minutesTemplates).toBe(stored.minutesTemplates);
  });

  it("read as the built-in format without Minutes formats", () => {
    const s = withExtensions(stored, { ...allOn, minutesFormats: false });
    expect(s.minutesTemplates).toEqual([]);
    expect(s.defaultMinutesTemplateId).toBe("");
    expect(s.llmProvider).toBe("anthropic");
  });

  it("read as no translation without Translation", () => {
    expect(withExtensions(stored, { ...allOn, translation: false }).sttTranslate).toBe(false);
  });

  it("is what does the work reads, so nothing switched off is used", () => {
    // Recording, transcribing, queueing and the health check act on the effective settings;
    // getLlmConfig is the one way every LLM feature finds its provider.
    for (const f of [
      "app/api/meetings/[id]/record/route.ts",
      "app/api/meetings/[id]/transcribe/route.ts",
      "lib/queue/runners/transcribe.ts",
      "lib/queue/runners/minutes.ts",
      "app/api/health/route.ts",
    ]) {
      expect(read(f), f).toContain("readEffectiveSettings()");
    }
    const settings = read("lib/settings.ts");
    const llm = settings.slice(settings.indexOf("export async function getLlmConfig"));
    expect(llm.split(/\r?\n/)[1]).toBe("  const s = await readEffectiveSettings();");
  });
});
