import { NextRequest, NextResponse } from "next/server";
import { reorderQueue } from "@/lib/queue/reorder";

export const runtime = "nodejs";

// The queue screen's drag, landed. Only jobs still waiting can move — one that is running is
// not in a position any more, it is in progress.
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { ids?: unknown } | null;
  if (!Array.isArray(body?.ids) || !body.ids.every((i) => typeof i === "string")) {
    return NextResponse.json({ error: "ids must be a list of job ids" }, { status: 400 });
  }
  return NextResponse.json({ ordered: await reorderQueue(body.ids as string[]) });
}
