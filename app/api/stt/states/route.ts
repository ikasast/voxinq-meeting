import { NextRequest, NextResponse } from "next/server";
import { readJson } from "@/lib/api";
import { readerOwnsOf, relay } from "@/lib/stt/relay";

export const runtime = "nodejs";

// Which of these meetings have a recording, and which are kept, for the list's badges.
// Only the reader's own are asked about; the rest are left out of the answer (lib/stt/relay.ts).
export async function POST(req: NextRequest) {
  const body = await readJson<{ ids?: unknown }>(req);
  const ids = await readerOwnsOf(body?.ids);
  if (ids.length === 0) return NextResponse.json({});
  return relay("/recordings/states", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
    timeoutMs: 6000,
  });
}
