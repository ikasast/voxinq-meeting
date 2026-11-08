import { NextRequest } from "next/server";
import { apiError } from "@/lib/api";
import { readerOwns, relay } from "@/lib/stt/relay";

export const runtime = "nodejs";
// An hour of a meeting is over 100 MB, read by the player a piece at a time or by a download whole.
export const maxDuration = 900;

// The recording itself, for the player and for downloading it (lib/stt/relay.ts). The player's
// Range header goes through, so seeking asks for the part it needs rather than the whole file.
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!(await readerOwns(id))) return apiError("meeting not found", 404);
  const range = req.headers.get("range");
  return relay(`/recordings/${encodeURIComponent(id)}/audio`, {
    headers: range ? { Range: range } : undefined,
  });
}
