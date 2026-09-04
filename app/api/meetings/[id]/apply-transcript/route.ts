import { NextRequest, NextResponse } from "next/server";
import { apiError, readJson } from "@/lib/api";
import { MeetingWorkError, type Utterance, applyTranscript } from "@/lib/meetings/apply";

export const runtime = "nodejs";

// Replace the whole transcript with the results of a fresh recognition. The work is in
// lib/meetings/apply.ts, which the queue's transcribe runner calls directly.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await readJson<{ utterances?: unknown; usedModel?: unknown }>(req);

  if (!Array.isArray(body?.utterances)) return apiError("utterances is required", 400);
  const utterances: Utterance[] = [];
  for (const u of body.utterances) {
    if (!u || typeof u !== "object") return apiError("invalid utterances", 400);
    const { start, end, text, translation } = u as Record<string, unknown>;
    if (typeof text !== "string" || !text.trim()) continue;
    const startSec = typeof start === "number" && start >= 0 ? start : 0;
    utterances.push({
      start: startSec,
      end: typeof end === "number" && end >= startSec ? end : startSec,
      text: text.trim(),
      translation:
        typeof translation === "string" && translation.trim() ? translation.trim() : null,
    });
  }
  if (utterances.length === 0) return apiError("no utterances", 400);

  const usedModel =
    typeof body?.usedModel === "string" && body.usedModel.trim() ? body.usedModel.trim() : null;

  try {
    return NextResponse.json(await applyTranscript(id, utterances, usedModel));
  } catch (e) {
    if (e instanceof MeetingWorkError) return apiError(e.message, e.status);
    throw e;
  }
}
