import { NextRequest, NextResponse } from "next/server";
import { sttInternalUrl } from "@/lib/stt/internal";
import { readSettings } from "@/lib/settings";

// Start recognition of a saved recording.
//
// The browser talks to the STT service directly for everything else about a job — starting one
// used to go the same way, and status polling still does. This one step goes through the server
// for a single reason: when recognition is being done by an HTTP provider, the request carries
// an **API key**, and the browser is not a place to put one. Same shape as
// `app/api/meetings/[id]/end/route.ts`, which reaches the service server-side for its own
// reasons.
//
// So the key lives in settings.json, is read here, and travels over STT_INTERNAL_URL. It is
// never in a response: `toPublic` strips it, and this route returns only the service's status.

export const runtime = "nodejs";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const s = await readSettings();

  // Settings first, environment second. An install configured entirely from .env keeps working
  // without anyone opening the settings screen, and filling the screen in overrides it.
  const baseUrl = (s.sttRemoteBaseUrl || process.env.STT_CLOUD_BASE_URL || "").trim();
  const apiKey = (s.sttRemoteApiKey || process.env.STT_CLOUD_API_KEY || "").trim();
  const model = (s.sttRemoteModel || process.env.STT_CLOUD_MODEL || "").trim();
  const wantsRemote = s.sttProvider === "remote";

  if (wantsRemote && !baseUrl) {
    return NextResponse.json(
      { error: "Remote transcription is selected but has no base URL. Settings → Transcription." },
      { status: 400 },
    );
  }

  const payload: Record<string, unknown> = {
    language: typeof body.language === "string" ? body.language : undefined,
    model: typeof body.model === "string" ? body.model : undefined,
    initialPrompt: typeof body.initialPrompt === "string" ? body.initialPrompt : undefined,
    translate: body.translate === true,
  };
  // Absent means "recognise on the STT host", which is what the service does by default. The
  // block is only ever added when someone chose it here.
  if (wantsRemote) {
    payload.remote = { baseUrl, apiKey, model: model || undefined };
  }

  try {
    const res = await fetch(`${sttInternalUrl()}/transcribe/${encodeURIComponent(id)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
    });
    const text = await res.text();
    // What actually recognised this, for the meeting to record. The caller cannot work it out:
    // it knows which model it *asked* for, and a remote endpoint ignores that and uses its own.
    // Only this route sees both sides of the decision.
    let usedModel = payload.model ? String(payload.model) : "";
    if (wantsRemote) {
      let host = baseUrl;
      try {
        host = new URL(baseUrl).hostname || baseUrl;
      } catch {
        /* an unparseable URL is still worth naming */
      }
      usedModel = `${model || "whisper-large-v3-turbo"} (${host})`;
    }
    if (res.ok) {
      try {
        const merged = { ...(JSON.parse(text) as Record<string, unknown>), usedModel };
        return NextResponse.json(merged, { status: res.status });
      } catch {
        /* not JSON; fall through and pass it along untouched */
      }
    }
    // Pass the service's own message through: "recording not found" and "another job is
    // running" are both things the user can act on, and rewording them here would only lose
    // detail.
    return new NextResponse(text, {
      status: res.status,
      headers: { "Content-Type": res.headers.get("Content-Type") ?? "application/json" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "transcription service unreachable";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
