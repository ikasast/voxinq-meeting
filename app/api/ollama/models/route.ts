import { NextResponse } from "next/server";
import { readJson } from "@/lib/api";
import { listModels, ollamaBase } from "@/lib/llm/ollama-models";
import { budgetMb, isLocalUrl } from "@/lib/queue/capacity";
import { getLlmConfig } from "@/lib/settings";

export const runtime = "nodejs";

// Which models the Ollama in use has installed — for the settings screen, which offers them as
// suggestions and says whether the one typed is among them.
//
// The address can come with the request, because the screen asks about what is typed there
// before it is saved: checking the saved address while the field says another would answer a
// question nobody asked. POST, so a read-only visitor from outside cannot make this server
// probe addresses of their choosing.
export async function POST(req: Request) {
  const body = await readJson<{ baseUrl?: unknown }>(req);
  const typed = typeof body?.baseUrl === "string" && body.baseUrl.trim() ? body.baseUrl.trim() : null;
  const base = ollamaBase(typed ?? (await getLlmConfig()).ollamaBaseUrl);
  if (!base) return NextResponse.json({ reachable: false, models: [], local: false, budgetMb: null });

  const models = await listModels(base);
  const local = isLocalUrl(base);
  return NextResponse.json({
    reachable: models !== null,
    models: models ?? [],
    // On this machine, a model competes for the card the queue budgets. Elsewhere it does not,
    // and a size warning would be about somebody else's hardware.
    local,
    budgetMb: local ? await budgetMb() : null,
  });
}
