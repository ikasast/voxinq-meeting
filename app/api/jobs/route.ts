import { NextResponse } from "next/server";
import { openJobs } from "@/lib/queue/queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Everything running or waiting. The queue screen's list, and what the rail counts.
export async function GET() {
  return NextResponse.json({ jobs: await openJobs() });
}
