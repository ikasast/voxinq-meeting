import { NextRequest } from "next/server";

export const runtime = "nodejs";

// Temporary, for the 4.1 betas: the Android app's display size as the phone's WebView sees it
// (app/display-size.ts reportDisplaySize), written to the server log for reading there. Numbers
// and the viewport tag only. Remove before 4.1.0.

const FIELDS = ["event", "size", "stored", "screenWidth", "innerWidth", "scale", "dpr", "tags", "cookie", "path", "chrome", "app"];

export async function POST(req: NextRequest) {
  const text = await req.text().catch(() => "");
  if (text.length > 4000) return new Response(null, { status: 413 });
  let body: Record<string, unknown> = {};
  try {
    body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return new Response(null, { status: 400 });
  }
  const kept = Object.fromEntries(FIELDS.filter((k) => k in body).map((k) => [k, body[k]]));
  console.log(`[display-size] ${JSON.stringify(kept)}`);
  return new Response(null, { status: 204 });
}
