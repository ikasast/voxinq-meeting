import { NextResponse } from "next/server";
import { apiError, readJson } from "@/lib/api";
import { currentUser } from "@/lib/auth/session";
import { isModelName, ollamaBase, startPull } from "@/lib/llm/ollama-models";
import { getLlmConfig } from "@/lib/settings";

export const runtime = "nodejs";

// Fetch a model into the Ollama in use. An administrator's action only: it puts gigabytes on
// the server's disk and, while it runs, takes the server's bandwidth — both belong to whoever
// runs the machine, not to everybody who can pick a model for their own minutes.
//
// It answers at once. The download carries on in the server whether or not the page stays
// open; `./status` says how far it has got.
export async function POST(req: Request) {
  const me = await currentUser();
  // No accounts at all is one person's instance, as the settings route treats it.
  if (me && !me.isAdmin) {
    return apiError("Only an administrator can download models to this server.", 403);
  }

  const body = await readJson<{ model?: unknown; baseUrl?: unknown }>(req);
  const model = typeof body?.model === "string" ? body.model.trim() : "";
  if (!isModelName(model)) return apiError("That is not a model name Ollama would accept.", 400);

  const typed = typeof body?.baseUrl === "string" && body.baseUrl.trim() ? body.baseUrl.trim() : null;
  const base = ollamaBase(typed ?? (await getLlmConfig()).ollamaBaseUrl);
  if (!base) return apiError("The Ollama address is not an http(s) address.", 400);

  const { started, state } = startPull(base, model);
  return NextResponse.json({ started, state }, { status: started ? 202 : 200 });
}
