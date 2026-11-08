import { NextRequest } from "next/server";
import { relay } from "@/lib/stt/relay";

export const runtime = "nodejs";

// Load the recognition model before a recording starts (lib/stt/preload.ts). Anybody signed in
// may: it is about to be needed for their own recording, and it touches nobody's meeting.
export async function POST(req: NextRequest) {
  const params = new URLSearchParams();
  const model = req.nextUrl.searchParams.get("model");
  if (model) params.set("model", model);
  if (req.nextUrl.searchParams.get("translate")) params.set("translate", "1");
  const qs = params.size > 0 ? `?${params}` : "";
  return relay(`/preload${qs}`, { method: "POST", timeoutMs: 8000 });
}
