import { NextRequest, NextResponse } from "next/server";
import { MeetingWorkError, applySpeakers } from "@/lib/meetings/apply";

export const runtime = "nodejs";

// Apply diarization results to the transcript. The work is in lib/meetings/apply.ts, because
// the queue runs the same thing without going through HTTP; this is the browser's door to it.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { speakers?: unknown } | null;
  const speakers = body?.speakers;
  if (!Array.isArray(speakers) || !speakers.every((s) => typeof s === "string")) {
    return NextResponse.json({ error: "invalid speakers" }, { status: 400 });
  }
  try {
    return NextResponse.json(await applySpeakers(id, speakers));
  } catch (e) {
    if (e instanceof MeetingWorkError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
