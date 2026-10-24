import { NextResponse } from "next/server";
import { apiError, readJson } from "@/lib/api";
import { currentUser } from "@/lib/auth/session";
import { libraryTags, searchLibrary } from "@/lib/llm/ollama-library";

export const runtime = "nodejs";

// Search Ollama's library, or list one model's tags — for choosing what to download.
//
// For administrators, as downloading is: a search is this server asking ollama.com something,
// and only the person who can then download has a reason to. POST, so that a page elsewhere
// cannot make the server ask.
//
// A failure to reach ollama.com is an answer, not an error: on a server kept off the internet it
// is the expected one, and the screen says what it means there.
export async function POST(req: Request) {
  const me = await currentUser();
  if (me && !me.isAdmin) {
    return apiError("Only an administrator can download models to this server.", 403);
  }

  const body = await readJson<{ q?: unknown; model?: unknown }>(req);
  const model = typeof body?.model === "string" ? body.model.trim() : "";
  if (model) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(model)) return NextResponse.json({ failed: "unreadable" });
    const r = await libraryTags(model);
    return NextResponse.json("error" in r ? { failed: r.error } : { tags: r.tags });
  }

  const q = typeof body?.q === "string" ? body.q.trim().slice(0, 100) : "";
  if (!q) return NextResponse.json({ models: [] });
  const r = await searchLibrary(q);
  return NextResponse.json("error" in r ? { failed: r.error } : { models: r.models });
}
