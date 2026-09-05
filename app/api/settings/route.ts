import { NextRequest, NextResponse } from "next/server";
import {
  type AppSettings,
  VALID_REST_SCREEN_SECONDS,
  readMachineSettings,
  readSettings,
  toPublic,
  writeSettings,
  writeUserSettings,
} from "@/lib/settings";
import { currentUser } from "@/lib/auth/session";
import { isMachineKey, isSplitKey } from "@/lib/settings-scope";
import { normalizeProfiles } from "@/lib/stt/profiles";
import { normalizeTemplates } from "@/lib/minutes-templates";

export const runtime = "nodejs";

export async function GET() {
  const s = await readSettings();
  const me = await currentUser();
  // The screen needs to know which fields it may offer, and saying so here keeps that answer
  // in one place rather than in the component's idea of who is an administrator.
  return NextResponse.json({ ...toPublic(s), isAdmin: me?.isAdmin ?? true });
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
  "defaultMinutesTemplateId",
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
  // The only number the settings screen edits. Checked against the list it offers rather than
  // a range: anything else is a mistake, and writeSettings would drop it anyway.
  if (typeof body.restScreenSeconds === "number" && VALID_REST_SCREEN_SECONDS.includes(body.restScreenSeconds)) {
    patch.restScreenSeconds = body.restScreenSeconds;
  }
  // 0 means "work it out from the card". Anything under 512 MB is a typo, not a budget, and
  // writeSettings refuses it too — this is just the earlier of the two.
  if (
    typeof body.vramBudgetMb === "number" &&
    Number.isFinite(body.vramBudgetMb) &&
    (body.vramBudgetMb === 0 || body.vramBudgetMb >= 512)
  ) {
    patch.vramBudgetMb = Math.round(body.vramBudgetMb);
  }
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

  // Templates arrive whole, like profiles. Nothing secret in them, so no merging with what is
  // stored -- what the form holds is what there is.
  if (Array.isArray(body.minutesTemplates)) {
    patch.minutesTemplates = normalizeTemplates(body.minutesTemplates);
  }

  // Where the patch goes depends on what is in it. Hardware belongs to the machine and only an
  // administrator may set it; everything else is this person's own preference.
  const me = await currentUser();
  const machineBits = Object.keys(patch).filter(isMachineKey);
  if (machineBits.length > 0 && me && !me.isAdmin) {
    return NextResponse.json(
      {
        error: `Only an administrator can change ${machineBits.join(", ")} — they describe the machine, not you.`,
      },
      { status: 403 },
    );
  }

  // With no accounts at all this is the app it has always been: one settings file, no owner.
  if (!me) {
    const next = await writeSettings(patch);
    return NextResponse.json(toPublic(next));
  }

  const machinePatch: Partial<AppSettings> = {};
  const userPatch: Partial<AppSettings> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (isSplitKey(k)) continue; // handled below, because it is two lists in one field
    (isMachineKey(k) ? machinePatch : userPatch)[k as keyof AppSettings] = v as never;
  }

  // The endpoint list arrives as one list and is stored as two. Entries the machine publishes
  // stay the machine's — an administrator editing them changes them for everybody, and anybody
  // else's copy of them is ignored rather than refused, because the screen already shows them
  // as not theirs to edit and a rejected save would only be confusing.
  if (patch.sttProfiles) {
    const sharedIds = new Set((await readMachineSettings()).sttProfiles.map((p) => p.id));
    const posted = patch.sttProfiles;
    userPatch.sttProfiles = posted.filter((p) => !sharedIds.has(p.id));
    if (me.isAdmin) machinePatch.sttProfiles = posted.filter((p) => sharedIds.has(p.id));
  }
  if (Object.keys(machinePatch).length > 0) await writeSettings(machinePatch);
  const next =
    Object.keys(userPatch).length > 0
      ? await writeUserSettings(me.id, userPatch)
      : await readSettings();
  return NextResponse.json({ ...toPublic(next), isAdmin: me.isAdmin });
}
