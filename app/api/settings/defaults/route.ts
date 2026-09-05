import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/lib/auth/session";
import { normalizeTemplates } from "@/lib/minutes-templates";
import {
  type AppSettings,
  VALID_REST_SCREEN_SECONDS,
  readMachineSettings,
  toPublic,
  writeSettings,
} from "@/lib/settings";
import { isUserKey } from "@/lib/settings-scope";

export const runtime = "nodejs";

// What everybody gets before they have an opinion.
//
// The ordinary settings screen is always *yours*: an administrator changing their minutes
// language changes their own minutes, not everybody's. This is the other thing, kept apart so
// the difference is a place rather than a mode — the house standard, which reaches everyone who
// has not chosen for themselves and stops reaching them the moment they do.
//
// Only the settings a person could have chosen appear here. Hardware is not a default anybody
// falls back to; there is one card, and its settings are on the normal screen where an
// administrator is the only one who can move them.

function clean(v: string): string {
  // Written as escapes rather than as the characters themselves: a literal zero-width space
  // here is invisible to whoever reads it next, which is the problem this function exists to fix.
  return v.replace(/[\u200B-\u200D\u2060\uFEFF]/g, "").trim();
}

/** The defaults as they stand, which is the machine file rather than anybody's merged view. */
export async function GET() {
  const me = await currentUser();
  if (me && !me.isAdmin) return NextResponse.json({ error: "unauthorized" }, { status: 403 });
  return NextResponse.json(toPublic(await readMachineSettings()));
}

export async function PATCH(req: NextRequest) {
  const me = await currentUser();
  if (me && !me.isAdmin) {
    return NextResponse.json(
      { error: "Only an administrator sets the defaults everybody starts from." },
      { status: 403 },
    );
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "invalid body" }, { status: 400 });

  const patch: Partial<AppSettings> = {};
  for (const [k, v] of Object.entries(body)) {
    // Only what a person could have chosen. A machine key arriving here would be written to the
    // same file by a second route with none of the first one's checks.
    if (!isUserKey(k)) continue;
    if (typeof v === "string") (patch as Record<string, string>)[k] = clean(v);
    else if (typeof v === "boolean") (patch as Record<string, boolean>)[k] = v;
    else if (typeof v === "number" && Number.isFinite(v)) {
      (patch as Record<string, number>)[k] = v;
    }
  }

  // The two that are neither a string nor a number, and one that is checked against a list.
  if (Array.isArray(body.minutesTemplates)) {
    patch.minutesTemplates = normalizeTemplates(body.minutesTemplates);
  }
  if (
    patch.restScreenSeconds !== undefined &&
    !VALID_REST_SCREEN_SECONDS.includes(patch.restScreenSeconds)
  ) {
    delete patch.restScreenSeconds;
  }
  // An empty key means "no change", the same as on the ordinary screen: the browser is never
  // sent the stored one, so it has nothing to send back.
  for (const k of ["anthropicApiKey", "openaiApiKey"] as const) {
    if (patch[k] === "") delete patch[k];
    if (body[`clear${k[0].toUpperCase()}${k.slice(1)}`] === true) patch[k] = "";
  }

  return NextResponse.json(toPublic(await writeSettings(patch)));
}
