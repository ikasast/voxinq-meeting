import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { currentUser } from "@/lib/auth/session";
import { readMachineSettings, writeSettings } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Whether every phone's app has to be locked behind its fingerprint, face or screen lock.
//
// Read by the Android app itself (AppLock.kt), before it has a session — the proxy lets this GET
// through for that reason, and it says nothing but yes or no. Set by an administrator from
// Settings → Defaults for everyone. It is a rule the app keeps: the server cannot see whether it
// does, and an app too old to know about it opens as it always has.

export async function GET() {
  const s = await readMachineSettings();
  return NextResponse.json({ required: s.requireAppLock });
}

export async function PATCH(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { required?: unknown } | null;
  if (typeof body?.required !== "boolean") return apiError("invalid body", 400);
  // With no accounts there is nobody to ask, and the settings screen is everyone's.
  const me = await currentUser();
  if (me && !me.isAdmin) return apiError("Only an administrator can require the app lock.", 403);
  const s = await writeSettings({ requireAppLock: body.required });
  return NextResponse.json({ required: s.requireAppLock });
}
