import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { meetingSttToken } from "@/lib/stt/auth";
import { readerOwns } from "@/lib/stt/relay";

export const runtime = "nodejs";

// A token to record into this meeting, for its owner (lib/stt/auth.ts). The page asks before each
// connection to the transcription service, and the Android app before each of its own, so a
// meeting that outlasts one token, or a recording sent hours later, gets a fresh one.
//
// `token: null` means the service is not checking (no secret), and the client sends nothing.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!(await readerOwns(id))) return apiError("meeting not found", 404);
  const t = meetingSttToken(id);
  return NextResponse.json(t ?? { token: null }, { headers: { "Cache-Control": "no-store" } });
}
