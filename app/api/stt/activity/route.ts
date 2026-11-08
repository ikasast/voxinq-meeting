import { NextRequest, NextResponse } from "next/server";
import { readJson } from "@/lib/api";
import { readerOwnsOf, relay } from "@/lib/stt/relay";

export const runtime = "nodejs";

// What the transcription service is doing for each of these meetings right now — recording,
// transcribing, separating speakers — for the list's labels. The reader's own only.
export async function POST(req: NextRequest) {
  const body = await readJson<{ ids?: unknown }>(req);
  const ids = await readerOwnsOf(body?.ids);
  if (ids.length === 0) return NextResponse.json({});
  return relay("/activity", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
    timeoutMs: 4000,
  });
}
