import { NextResponse } from "next/server";
import { currentBackup } from "@/lib/backup/progress";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Polled by the Data tab while an export or import request is in flight, so the button can say
// "recordings 7/12" rather than spin blankly for a minute. Reports only a phase string — the
// operation itself finishes in its own request whether or not anyone is watching.
export async function GET() {
  const current = currentBackup();
  return NextResponse.json(
    current
      ? { running: true, operation: current.operation, phase: current.phase, startedAt: current.startedAt }
      : { running: false },
    { headers: { "Cache-Control": "no-store" } },
  );
}
