import { NextRequest } from "next/server";
import { apiError } from "@/lib/api";
import { readerOwns, relay } from "@/lib/stt/relay";

export const runtime = "nodejs";

// Keep this meeting's recording past the retention period, or stop keeping it (?on=true|false).
// Answers with the recording's protection state, as the service does (lib/stt/relay.ts).
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!(await readerOwns(id))) return apiError("meeting not found", 404);
  const on = req.nextUrl.searchParams.get("on") !== "false";
  return relay(`/recordings/${encodeURIComponent(id)}/protect?on=${on}`, { method: "POST", timeoutMs: 5000 });
}
