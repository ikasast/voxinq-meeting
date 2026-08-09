import { NextResponse } from "next/server";
import { readJson } from "@/lib/api";
import { abortGeneration } from "@/lib/llm/generation-registry";
import { unloadOllama } from "@/lib/llm/ollama";
import { getLlmConfig } from "@/lib/settings";

export const runtime = "nodejs";

// Interrupt an in-flight minutes generation to hand the GPU back to a recording.
// Aborts the LLM call(s) and, for the local Ollama provider, unloads the model so its
// VRAM frees immediately. (External callers are already blocked by proxy.ts as a mutating
// request.) Best-effort: returns which generations were aborted.
export async function POST(req: Request) {
  const body = await readJson<{ meetingId?: string }>(req);
  const meetingId = typeof body?.meetingId === "string" ? body.meetingId : undefined;

  const aborted = abortGeneration(meetingId);

  const cfg = await getLlmConfig();
  if (cfg.provider === "ollama") {
    await unloadOllama(cfg);
  }

  return NextResponse.json({ aborted });
}
