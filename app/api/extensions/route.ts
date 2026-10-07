import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { currentUser } from "@/lib/auth/session";
import { readExtensions, writeExtensions } from "@/lib/extensions-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Which extensions are on (lib/extensions.ts). Anybody may read it — the screens need to know
// what to show — and only an administrator switches them. On an instance without accounts there
// is nobody to tell apart, as with the rest of the settings.

export async function GET() {
  return NextResponse.json(await readExtensions());
}

export async function PATCH(req: NextRequest) {
  const me = await currentUser();
  if (me && !me.isAdmin) {
    return apiError("Only an administrator switches extensions on or off.", 403);
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") return apiError("invalid body", 400);
  return NextResponse.json(await writeExtensions(body));
}
