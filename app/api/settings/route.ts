import { NextRequest, NextResponse } from "next/server";
import { type AppSettings, readSettings, toPublic, writeSettings } from "@/lib/settings";

export const runtime = "nodejs";

export async function GET() {
  const s = await readSettings();
  return NextResponse.json(toPublic(s));
}

const STRING_FIELDS: (keyof AppSettings)[] = [
  "whisperModel",
  "sttLanguage",
  "sttGlossary",
  "micMode",
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
    if (typeof v === "string") (patch as Record<string, string>)[key] = v;
  }
  // Update API keys only when a value is passed (empty string is ignored as "no change").
  if (typeof body.anthropicApiKey === "string" && body.anthropicApiKey.trim()) {
    patch.anthropicApiKey = body.anthropicApiKey.trim();
  }
  if (typeof body.openaiApiKey === "string" && body.openaiApiKey.trim()) {
    patch.openaiApiKey = body.openaiApiKey.trim();
  }
  // To explicitly clear a key, use the __clear flag.
  if (body.clearAnthropicApiKey === true) patch.anthropicApiKey = "";
  if (body.clearOpenaiApiKey === true) patch.openaiApiKey = "";

  const next = await writeSettings(patch);
  return NextResponse.json(toPublic(next));
}
