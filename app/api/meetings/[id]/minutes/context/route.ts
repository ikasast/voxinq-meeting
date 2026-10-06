import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { contextPreviews, gatherMinutesContext } from "@/lib/minutes-context-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// What a set of minutes for this meeting would be given besides the transcript, one line per
// piece, so the choice can be made looking at it. Read by the same function the job uses.

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await gatherMinutesContext(id);
  if (!ctx) return apiError("not found", 404);
  return NextResponse.json({ previews: contextPreviews(ctx) });
}
