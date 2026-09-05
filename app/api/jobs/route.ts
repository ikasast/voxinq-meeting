import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth/session";
import { openJobsAcrossUsers } from "@/lib/queue/queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Everything running or waiting. The queue screen's list, and what the rail counts.
export async function GET() {
  // The same list the page renders, redacted the same way: the poll must not become a way to
  // read the titles the page took care not to send.
  const me = await currentUser();
  return NextResponse.json({ jobs: await openJobsAcrossUsers(me?.id ?? null) });
}
