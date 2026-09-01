import { NextRequest, NextResponse } from "next/server";
import { type AppSettings, readSettings, toPublic, writeSettings } from "@/lib/settings";

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
  "sttProvider",
  "sttRemoteBaseUrl",
  "sttRemoteModel",
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
  if (typeof body.sttRemoteApiKey === "string" && cleanSetting(body.sttRemoteApiKey)) {
    patch.sttRemoteApiKey = cleanSetting(body.sttRemoteApiKey);
  }
  // To explicitly clear a key, use the __clear flag.
  if (body.clearAnthropicApiKey === true) patch.anthropicApiKey = "";
  if (body.clearOpenaiApiKey === true) patch.openaiApiKey = "";
  if (body.clearSttRemoteApiKey === true) patch.sttRemoteApiKey = "";

  const next = await writeSettings(patch);
  return NextResponse.json(toPublic(next));
}
