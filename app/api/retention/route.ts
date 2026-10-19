import { NextResponse } from "next/server";
import { recordingRetention, trashRetentionDays } from "@/lib/retention";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The periods in force: the recordings' as the transcription service enforces it (null when it
// does not answer), and the trash's. For Settings → Data, to say what "as the service is set" is.
export async function GET() {
  const [recording, trash] = await Promise.all([recordingRetention(), trashRetentionDays()]);
  return NextResponse.json({ recording, trash });
}
