import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Whether a GPU-bound minutes generation is running (this app / Ollama). The single GPU is
// shared, so the UI uses this (plus the STT service's own /health "busy") to stop a second
// task from being started while one is in progress.
export async function GET() {
  const m = await prisma.meeting.findFirst({
    where: { summaryStatus: "processing" },
    select: { id: true, title: true },
  });
  return NextResponse.json({
    minutes: m ? { busy: true, meetingId: m.id, title: m.title } : { busy: false },
  });
}
