import { NextRequest, NextResponse } from "next/server";
import { readJson } from "@/lib/api";
import { MeetingWorkError, applyDiarizationEmbeddings } from "@/lib/meetings/apply";

export const runtime = "nodejs";

// Store the per-cluster voice embeddings from a diarization run and name what they match. The
// work is in lib/meetings/apply.ts — the queue calls it directly.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await readJson<{ embeddings?: unknown; embeddingModel?: unknown }>(req);
  try {
    return NextResponse.json(
      await applyDiarizationEmbeddings(id, body?.embeddings, body?.embeddingModel),
    );
  } catch (e) {
    if (e instanceof MeetingWorkError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
