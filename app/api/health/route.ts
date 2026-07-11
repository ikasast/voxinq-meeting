import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readSettings } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PostgreSQL reachability. A dead DB takes the whole app down (every page is 500),
// so surface it explicitly instead of letting each page fail on its own.
async function checkDb(): Promise<{ ok: boolean; detail?: string }> {
  try {
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 3000)),
    ]);
    return { ok: true };
  } catch {
    return { ok: false, detail: "Cannot reach PostgreSQL" };
  }
}

// Health check for the LLM (minutes generation) side and the DB.
// STT is checked by the browser hitting `${sttHttpBase()}/health` directly (recording goes
// browser->STT directly, so a check via the web server would not verify the actual recording path).
export async function GET() {
  const [s, db] = await Promise.all([readSettings(), checkDb()]);

  if (s.llmProvider === "ollama") {
    try {
      const res = await fetch(`${s.ollamaBaseUrl.replace(/\/+$/, "")}/api/version`, {
        signal: AbortSignal.timeout(3000),
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return NextResponse.json({ db, llm: { ok: true, provider: "ollama", detail: s.ollamaModel } });
    } catch {
      return NextResponse.json({
        db,
        llm: { ok: false, provider: "ollama", detail: "Cannot reach Ollama" },
      });
    }
  }

  // OpenAI-compatible local servers (LM Studio / vLLM) need no key: if none is set, ping
  // the endpoint's /models to confirm reachability instead of demanding a key.
  if (s.llmProvider === "openai" && !s.openaiApiKey) {
    try {
      const base = s.openaiBaseUrl.replace(/\/+$/, "");
      const res = await fetch(`${base}/models`, {
        signal: AbortSignal.timeout(3000),
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return NextResponse.json({ db, llm: { ok: true, provider: "openai", detail: s.openaiModel } });
    } catch {
      return NextResponse.json({
        db,
        llm: { ok: false, provider: "openai", detail: "Cannot reach the LLM (check the Base URL)" },
      });
    }
  }

  // For cloud LLMs (with a key), avoid the cost/latency of a live check and only verify a key is set.
  const hasKey = s.llmProvider === "anthropic" ? Boolean(s.anthropicApiKey) : Boolean(s.openaiApiKey);
  return NextResponse.json({
    db,
    llm: {
      ok: hasKey,
      provider: s.llmProvider,
      detail: hasKey ? undefined : "API key not set",
    },
  });
}
