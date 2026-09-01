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

  // Which destination this run uses. The request decides; the setting only supplies the
  // default. That is the whole point of profiles: choosing a remote endpoint in Settings used
  // to mean every re-transcription went there, with no way to ask for a local one.
  //
  //   profileId: "<id>"   that profile
  //   profileId: "local"  this machine, whatever the default is
  //   absent              the default profile, or this machine when there is none
  const asked = typeof body.profileId === "string" ? body.profileId : null;
  const wantedId = asked === null ? s.sttDefaultProfileId : asked === "local" ? "" : asked;
  const profile = wantedId ? s.sttProfiles.find((p) => p.id === wantedId) : undefined;

  if (wantedId && !profile) {
    return NextResponse.json(
      { error: "That transcription endpoint is no longer saved. Settings → Transcription." },
      { status: 400 },
    );
  }
  // The kind is stored so that saving a Gemini endpoint now needs no migration later, but the
  // service has no backend for it yet. Refusing here is the difference between "not built yet"
  // and an obscure failure from sending Gemini's address an OpenAI-shaped request.
  if (profile?.kind === "gemini") {
    return NextResponse.json(
      { error: `"${profile.name}" is a Gemini endpoint, which is not supported yet.` },
      { status: 400 },
    );
  }
  if (profile && !profile.baseUrl) {
    return NextResponse.json(
      { error: `"${profile.name}" has no address saved. Settings → Transcription.` },
      { status: 400 },
    );
  }

  const payload: Record<string, unknown> = {
    language: typeof body.language === "string" ? body.language : undefined,
    model: typeof body.model === "string" ? body.model : undefined,
    initialPrompt: typeof body.initialPrompt === "string" ? body.initialPrompt : undefined,
    translate: body.translate === true,
  };
  if (profile) {
    payload.remote = {
      kind: profile.kind,
      baseUrl: profile.baseUrl,
      apiKey: profile.apiKey,
      model: profile.model || undefined,
    };
  }

  // What actually recognised this, for the meeting to record. The caller cannot work it out:
  // it knows which model it asked for, and a remote endpoint ignores that and uses its own.
  let usedModel = payload.model ? String(payload.model) : "";
  if (profile) {
    let host = profile.baseUrl;
    try {
      host = new URL(profile.baseUrl).hostname || profile.baseUrl;
    } catch {
      /* an unparseable URL is still worth naming */
    }
    usedModel = `${profile.model || "default"} (${host})`;
  }

  try {
    const res = await fetch(`${sttInternalUrl()}/transcribe/${encodeURIComponent(id)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
    });
    const text = await res.text();
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
