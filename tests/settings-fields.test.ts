import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// A setting is only usable if four places agree about it: the type in lib/settings.ts, the
// input on the settings page, the allow-list in the API route, and the body the page posts.
// They are separate lists, and the remote-transcription fields shipped in three of the four --
// typed, shown and accepted, but never sent. Saving posted nothing for them and the reply, the
// unchanged values, overwrote what had just been typed. The base URL emptied itself.
//
// These read the sources rather than the running app, in the shape tests/embedding-models
// already uses, because the failure is a list drifting out of step and that is visible in the
// text.

const root = join(__dirname, "..");
const settingsSrc = readFileSync(join(root, "lib/settings.ts"), "utf8");
const routeSrc = readFileSync(join(root, "app/api/settings/route.ts"), "utf8");
const pageSrc = readFileSync(join(root, "app/settings/page.tsx"), "utf8");

/** Field names and types from the `AppSettings` type literal. */
function appSettingsFields(): { name: string; type: string }[] {
  const body = settingsSrc.slice(
    settingsSrc.indexOf("export type AppSettings = {"),
    settingsSrc.indexOf("function defaults()"),
  );
  const out: { name: string; type: string }[] = [];
  for (const line of body.split("\n")) {
    const m = /^\s{2}(\w+):\s*([^;]+);/.exec(line);
    if (m) out.push({ name: m[1], type: m[2].trim() });
  }
  return out;
}

// Handled by their own branches in the route: written only when non-empty, cleared by a flag.
const API_KEYS = ["anthropicApiKey", "openaiApiKey", "sttRemoteApiKey"];
// Not editable from the settings screen; they live in settings.json only.
const FILE_ONLY = ["voiceprintThreshold", "ollamaNumCtx"];

describe("settings fields stay in step across the files that must agree", () => {
  const fields = appSettingsFields();

  it("found the type at all", () => {
    expect(fields.length).toBeGreaterThan(15);
    expect(fields.map((f) => f.name)).toContain("sttRemoteBaseUrl");
  });

  it("every string setting the app can edit is in the API's allow-list", () => {
    // From the declaration to its closing bracket. `export async function GET` sits *above*
    // STRING_FIELDS in this file, so slicing to the first one of those gives nothing at all --
    // and a test that reads an empty haystack reports every field as missing, which is how
    // this was caught.
    const from = routeSrc.indexOf("const STRING_FIELDS");
    expect(from, "STRING_FIELDS not found in the route").toBeGreaterThan(-1);
    const allow = routeSrc.slice(from, routeSrc.indexOf("];", from));

    // Anything that is not a boolean or a number is a string setting, whether it is written as
    // `string` or as a union of literals or a named type like LlmProviderName.
    const missing = fields
      .filter((f) => f.type !== "boolean" && f.type !== "number")
      .filter((f) => !API_KEYS.includes(f.name) && !FILE_ONLY.includes(f.name))
      .filter((f) => !allow.includes(`"${f.name}"`))
      .map((f) => f.name);
    expect(missing, `not accepted by PATCH /api/settings: ${missing.join(", ")}`).toEqual([]);
  });

  it("the settings page posts the whole form rather than a hand-written list", () => {
    // The specific regression: a body assembled field by field is one someone will forget to
    // add to. Spreading what the form holds cannot go out of step with it.
    expect(pageSrc).toMatch(/const body: Record<string, unknown> = \{ \.\.\.rest \}/);
    expect(pageSrc).not.toMatch(/const body: Record<string, unknown> = \{\s*\n\s*whisperModel:/);
  });

  it("hides every API key from the client, and offers a way to clear each", () => {
    for (const key of API_KEYS) {
      const flag = "has" + key[0].toUpperCase() + key.slice(1);
      expect(settingsSrc, `${key} must be stripped by toPublic`).toContain(`${flag}:`);
      expect(routeSrc, `${key} needs a clear flag`).toContain(
        `clear${key[0].toUpperCase()}${key.slice(1)}`,
      );
    }
  });
});
