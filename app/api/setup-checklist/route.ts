import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { apiError, readJson } from "@/lib/api";
import { currentUser } from "@/lib/auth/session";
import { isExternalRequest } from "@/lib/is-tailnet";
import { findInstalled, listModels, ollamaBase, pullState } from "@/lib/llm/ollama-models";
import { getLlmConfig, readMachineSettings } from "@/lib/settings";
import { dismissChecklist, notePhoneReach, phoneKind, readChecklistState } from "@/lib/setup-checklist";
import { effectiveTimeZone, envTimeZoneChosen } from "@/lib/time-zone";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The first-run checklist on the home page (app/setup-checklist.tsx): what the server can say
// about itself. What only the browser can see — whether the transcription service answers from
// here, and which zone this browser is in — the page finds out on its own.
//
// For whoever runs the machine: an administrator, or anybody on an instance with no accounts,
// which is one person's (as the settings route treats it).

async function mayManage(): Promise<boolean> {
  if (await isExternalRequest()) return false;
  const me = await currentUser();
  return !me || me.isAdmin;
}

export async function GET() {
  if (!(await mayManage())) return NextResponse.json({ show: false });
  const state = await readChecklistState();
  if (state.dismissed) return NextResponse.json({ show: false });

  const machine = await readMachineSettings();
  const llm = await getLlmConfig();

  let minutes:
    | { provider: "ollama"; model: string; reachable: boolean; installed: boolean; pull: ReturnType<typeof pullState> }
    | { provider: string; model: string } = {
    provider: llm.provider,
    model: llm.provider === "anthropic" ? llm.anthropicModel : llm.openaiModel,
  };
  if (llm.provider === "ollama") {
    const base = ollamaBase(llm.ollamaBaseUrl);
    const models = base ? await listModels(base) : null;
    minutes = {
      provider: "ollama",
      model: llm.ollamaModel,
      reachable: models !== null,
      installed: models ? findInstalled(models, llm.ollamaModel) !== null : false,
      pull: base ? pullState(base, llm.ollamaModel) : null,
    };
  }

  return NextResponse.json({
    show: true,
    timeZone: {
      // Chosen in the app, or named in `.env`: either way somebody decided.
      chosen: machine.timeZone || envTimeZoneChosen() || null,
      effective: effectiveTimeZone(machine.timeZone),
    },
    minutes,
    phone: state.phone,
  });
}

/**
 * `{ dismiss: true }` closes the checklist for everybody. `{ phone: true }` is sent by any page
 * that reached the transcription service, and counts only from a phone — anybody signed in may
 * send it, since recording from the phone in their pocket is the thing being checked.
 */
export async function POST(req: Request) {
  const body = await readJson<{ dismiss?: unknown; phone?: unknown }>(req);
  if (body?.dismiss === true) {
    if (!(await mayManage())) return apiError("Only an administrator can close this.", 403);
    await dismissChecklist();
    return NextResponse.json({ ok: true });
  }
  if (body?.phone === true) {
    if (await isExternalRequest()) return NextResponse.json({ ok: false });
    const via = phoneKind((await headers()).get("user-agent"));
    if (!via) return NextResponse.json({ ok: false });
    await notePhoneReach(via);
    return NextResponse.json({ ok: true });
  }
  return apiError("Nothing to do.", 400);
}
