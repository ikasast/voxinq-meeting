import { applyTranscript, type Utterance } from "@/lib/meetings/apply";
import { readSettings } from "@/lib/settings";
import { parseParams } from "../types";
import { sttPost, sttWait } from "./stt-job";

// Recognising a saved recording again, as a queued job.
//
// The credential is the reason this was already half here: choosing a saved endpoint means the
// request carries an API key, and the browser is not a place to put one — so starting went
// through the server while polling stayed in the browser. Now both do, which also means a
// re-transcription survives the tab being closed.

export type TranscribeParams = {
  /** A saved endpoint's id, "local" for this machine, or absent for the default. */
  profileId?: string;
  /** A local Whisper model id. Meaningless to a remote endpoint, which uses its own. */
  model?: string;
  language?: string;
  initialPrompt?: string;
  translate?: boolean;
};

/**
 * Work out where this run goes, and what to tell the meeting it was recognised with.
 *
 * Exported so the enqueue route can refuse an endpoint that is no longer saved *before* the job
 * is queued: finding that out when the job reaches the front, minutes later, is a worse way to
 * be told.
 */
export async function resolveDestination(params: TranscribeParams) {
  const s = await readSettings();
  //   profileId: "<id>"   that endpoint
  //   profileId: "local"  this machine, whatever the default is
  //   absent              the default endpoint, or this machine when there is none
  const asked = typeof params.profileId === "string" ? params.profileId : null;
  const wantedId = asked === null ? s.sttDefaultProfileId : asked === "local" ? "" : asked;
  const profile = wantedId ? s.sttProfiles.find((p) => p.id === wantedId) : undefined;

  if (wantedId && !profile) {
    throw new Error("That transcription endpoint is no longer saved. Settings → Transcription.");
  }
  if (profile && !profile.baseUrl) {
    throw new Error(`"${profile.name}" has no address saved. Settings → Transcription.`);
  }

  const payload: Record<string, unknown> = {
    language: params.language,
    model: params.model,
    initialPrompt: params.initialPrompt,
    translate: params.translate === true,
  };
  if (profile) {
    payload.remote = {
      kind: profile.kind,
      baseUrl: profile.baseUrl,
      apiKey: profile.apiKey,
      model: profile.model || undefined,
    };
  }

  // What actually recognised this, for the meeting to record. The caller cannot work it out: it
  // knows which model it asked for, and a remote endpoint ignores that and uses its own.
  let usedModel = params.model ?? "";
  if (profile) {
    let host = profile.baseUrl;
    try {
      host = new URL(profile.baseUrl).hostname || profile.baseUrl;
    } catch {
      /* an unparseable URL is still worth naming */
    }
    usedModel = `${profile.model || "default"} (${host})`;
  }

  return { payload, usedModel, external: Boolean(profile) };
}

export async function runTranscribe(
  job: { meetingId: string | null; params: string },
  signal?: AbortSignal,
) {
  const meetingId = job.meetingId;
  if (!meetingId) throw new Error("a transcribe job needs a meeting");
  const params = parseParams<TranscribeParams>(job.params);
  const { payload, usedModel } = await resolveDestination(params);

  await sttPost(`/transcribe/${encodeURIComponent(meetingId)}`, payload);
  const result = await sttWait(`/transcribe/${encodeURIComponent(meetingId)}/status`, signal);

  if (result.status === "error") throw new Error(String(result.detail ?? "recognition failed"));
  const utterances = result.utterances;
  if (!Array.isArray(utterances)) throw new Error("recognition returned no utterances");

  await applyTranscript(meetingId, utterances as Utterance[], usedModel || null);

  // Whatever the backend wanted said about the run — so far, that an endpoint answered without
  // word timings, which is why the whole meeting arrived as one utterance.
  return { note: typeof result.note === "string" ? result.note : undefined };
}
