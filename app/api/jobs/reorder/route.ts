import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/lib/auth/session";
import { asSystem } from "@/lib/db/scope";
import { reorderQueue } from "@/lib/queue/reorder";

export const runtime = "nodejs";

// The queue screen's drag, landed. Only jobs still waiting can move — one that is running is
// not in a position any more, it is in progress.
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { ids?: unknown } | null;
  if (!Array.isArray(body?.ids) || !body.ids.every((i) => typeof i === "string")) {
    return NextResponse.json({ error: "ids must be a list of job ids" }, { status: 400 });
  }
  // An administrator orders the whole queue, because it is one GPU and the order across
  // everybody is the only order there is. Anybody else reorders their own, and ids that are not
  // theirs are simply not found — reorderQueue already ignores what it cannot see.
  const ids = body.ids as string[];
  const me = await currentUser();
  const ordered = me?.isAdmin
    ? await asSystem("an administrator orders the shared queue", () => reorderQueue(ids))
    : await reorderQueue(ids);
  return NextResponse.json({ ordered });
}
