import { NextResponse } from "next/server";
import { apiError, readJson } from "@/lib/api";
import { currentUser } from "@/lib/auth/session";
import { modelsInUse } from "@/lib/llm/models-in-use";
import { deleteModel, isModelName, ollamaBase, pullState, sameModel } from "@/lib/llm/ollama-models";
import { getLlmConfig } from "@/lib/settings";

export const runtime = "nodejs";

// Remove a model from the Ollama in use, to give the disk back. An administrator's action, for
// the same reason fetching one is.
//
// Refused while anybody's minutes are written with it — the machine's default, or one person's
// own choice. Deleting it would not fail here; it would fail later, for somebody else, as
// minutes that never come. Choosing another model first is the way to free it.
export async function POST(req: Request) {
  const me = await currentUser();
  if (me && !me.isAdmin) {
    return apiError("Only an administrator can delete models from this server.", 403);
  }

  const body = await readJson<{ model?: unknown; baseUrl?: unknown }>(req);
  const model = typeof body?.model === "string" ? body.model.trim() : "";
  if (!isModelName(model)) return apiError("That is not a model name Ollama would accept.", 400);

  const typed = typeof body?.baseUrl === "string" && body.baseUrl.trim() ? body.baseUrl.trim() : null;
  const base = ollamaBase(typed ?? (await getLlmConfig()).ollamaBaseUrl);
  if (!base) return apiError("The Ollama address is not an http(s) address.", 400);

  if ((await modelsInUse()).some((m) => sameModel(m, model))) {
    return apiError(
      "{model} is what minutes are written with, for this machine or for somebody on it. Choose another model there first.",
      409,
      { vars: { model } },
    );
  }
  const pulling = pullState(base, model);
  if (pulling && !pulling.done) {
    return apiError("{model} is still downloading.", 409, { vars: { model } });
  }

  try {
    const result = await deleteModel(base, model);
    return NextResponse.json({ deleted: result === "deleted" });
  } catch (e) {
    return apiError("Ollama could not delete it: {reason}", 502, {
      vars: { reason: (e as Error).message },
    });
  }
}
