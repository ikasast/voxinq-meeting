import { NextResponse } from "next/server";
import { apiError, readJson } from "@/lib/api";
import { getFunnelState, setFunnelPublic } from "@/lib/funnel";
import { isExternalRequest } from "@/lib/is-tailnet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Read/toggle whether the web app is published to the internet via Tailscale Funnel.
// Managing this is strictly an internal (tailnet) operation: the POST is refused for
// external callers here, and proxy.ts already blocks external mutating requests (403).

export async function GET() {
  // Don't reveal funnel details or spawn tailscale for outside viewers.
  if (await isExternalRequest()) {
    return NextResponse.json({ internal: false, available: false, public: null, url: null });
  }
  const state = await getFunnelState();
  return NextResponse.json({ ...state, internal: true });
}

export async function POST(req: Request) {
  if (await isExternalRequest()) {
    return apiError("Remote access can only be changed from your local network.", 403);
  }
  const body = await readJson<{ public?: unknown }>(req);
  if (!body || typeof body.public !== "boolean") {
    return apiError("Expected { public: boolean }.", 400);
  }
  try {
    const state = await setFunnelPublic(body.public);
    return NextResponse.json({ ...state, internal: true });
  } catch (e) {
    const detail = e instanceof Error ? e.message : "unknown error";
    return apiError(`Failed to update Tailscale Funnel: ${detail}`, 500);
  }
}
