import { NextRequest } from "next/server";
import { apiError } from "@/lib/api";
import { relay } from "@/lib/stt/relay";

export const runtime = "nodejs";
export const maxDuration = 300;

/** A clip is at most three minutes; the service refuses longer ones with a reason. */
const MAX_BYTES = 64 * 1024 * 1024;

// A voiceprint from a clip of one person speaking, for enrolling them (Settings → Voices).
// Nothing is kept by the service: it answers with the vector, which the page saves.
export async function POST(req: NextRequest) {
  const length = Number(req.headers.get("content-length") ?? 0);
  if (Number.isFinite(length) && length > MAX_BYTES) return apiError("That file is too large to import.", 413);
  if (!req.body) return apiError("no audio in the request", 400);
  return relay("/voiceprint", {
    method: "POST",
    headers: { "Content-Type": req.headers.get("content-type") ?? "application/octet-stream" },
    body: req.body,
    duplex: "half",
  } as RequestInit & { duplex: "half" });
}
