import { NextRequest, NextResponse } from "next/server";
import { type AppSettings, readSettings, toPublic, writeSettings } from "@/lib/settings";
import { normalizeProfiles } from "@/lib/stt/profiles";

export const runtime = "nodejs";

export async function GET() {
  const s = await readSettings();
  return NextResponse.json(toPublic(s));
}

/**
 * Clean a pasted value.
 *
 * Zero-width characters ride along when a model name or a URL is copied out of a web page,
 * and they are invisible in the field afterwards. One arrived in front of
 * `whisper-large-v3` and the provider answered "The model does not exist" -- which sends you
 * to inspect a model name that looks exactly right. The same in an API key produces "Invalid
 * API Key" for a key you can see is correct.
 *
 * Zero-width space, ZWNJ, ZWJ, word joiner and BOM. Surrounding whitespace goes too: nothing
 * here is meant to begin or end with it, including the free-text fields.
 */
function cleanSetting(v: string): string {
  return v.replace(/[\u200B-\u200D\u2060\uFEFF]/g, "").trim();
}

const STRING_FIELDS: (keyof AppSettings)[] = [
  "whisperModel",
  "sttLanguage",
  "sttGlossary",
  "micMode",
  "sttDefaultProfileId",
  "llmProvider",
  "ollamaBaseUrl",
  "ollamaModel",
  "anthropicModel",
  "openaiBaseUrl",
  "openaiModel",
  "llmBackground",
  "summaryFormat",
  "summaryLanguage",
  "summaryDetail",
];

export async function PATCH(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const patch: Partial<AppSettings> = {};
  for (const key of STRING_FIELDS) {
    const v = body[key];
    if (typeof v === "string") (patch as Record<string, string>)[key] = cleanSetting(v);
  }
  if (typeof body.sttTranslate === "boolean") patch.sttTranslate = body.sttTranslate;
  // Update API keys only when a value is passed (empty string is ignored as "no change").
  if (typeof body.anthropicApiKey === "string" && cleanSetting(body.anthropicApiKey)) {
    patch.anthropicApiKey = cleanSetting(body.anthropicApiKey);
  }
  if (typeof body.openaiApiKey === "string" && cleanSetting(body.openaiApiKey)) {
    patch.openaiApiKey = cleanSetting(body.openaiApiKey);
  }

  // To explicitly clear a key, use the __clear flag.
  if (body.clearAnthropicApiKey === true) patch.anthropicApiKey = "";
  if (body.clearOpenaiApiKey === true) patch.openaiApiKey = "";

  // Profiles arrive whole, because the browser never receives the keys and so cannot send them
  // back. An entry with no key keeps the one already stored under that id; a new entry without
  // one simply has none, which is right for a server of your own that asks for nothing.
  if (Array.isArray(body.sttProfiles)) {
    const current = await readSettings();
    const kept = new Map(current.sttProfiles.map((p) => [p.id, p.apiKey]));
    patch.sttProfiles = normalizeProfiles(
      body.sttProfiles.map((raw) => {
        const p = (raw ?? {}) as Record<string, unknown>;
        const supplied = typeof p.apiKey === "string" ? cleanSetting(p.apiKey) : "";
        const id = typeof p.id === "string" ? p.id : "";
        return {
          ...p,
          baseUrl: typeof p.baseUrl === "string" ? cleanSetting(p.baseUrl) : "",
          model: typeof p.model === "string" ? cleanSetting(p.model) : "",
          apiKey: supplied || (p.clearApiKey === true ? "" : (kept.get(id) ?? "")),
        };
      }),
    );
  }

  const next = await writeSettings(patch);
  return NextResponse.json(toPublic(next));
}
