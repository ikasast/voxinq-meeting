import { NextResponse } from "next/server";
import { readJson } from "@/lib/api";
import { isModelName, ollamaBase, pullState } from "@/lib/llm/ollama-models";
import { getLlmConfig } from "@/lib/settings";

export const runtime = "nodejs";

// How far a download has got. Not limited to administrators: somebody choosing a model that is
// being fetched should be able to see that it is on its way. It reads what this process holds
// and asks nothing of Ollama.
export async function POST(req: Request) {
  const body = await readJson<{ model?: unknown; baseUrl?: unknown }>(req);
  const model = typeof body?.model === "string" ? body.model.trim() : "";
  const typed = typeof body?.baseUrl === "string" && body.baseUrl.trim() ? body.baseUrl.trim() : null;
  const base = ollamaBase(typed ?? (await getLlmConfig()).ollamaBaseUrl);
  if (!base || !isModelName(model)) return NextResponse.json({ state: null });
  return NextResponse.json({ state: pullState(base, model) });
}
