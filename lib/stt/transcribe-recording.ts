// Transcribe a saved recording end to end: start the job, wait for it, store the result.
//
// Two callers want this. Re-transcription replaces a transcript that already exists, and a
// host with no GPU acceleration uses it for the *first* transcript — there, recognition is
// slower than speech, so the meeting is recorded and recognised once at the end rather than
// live (see `liveTranscription` in lib/stt/preload.ts).
//
// It polls rather than streams because the job outlives any one request: recognising an hour
// of audio takes minutes, and the page is allowed to be closed and reopened over it.

import { sttHttpBase } from "@/lib/stt/client";
import { effectiveSttLanguage } from "@/lib/stt/models";

export type Utterance = {
  start: number;
  end: number;
  text: string;
  translation?: string;
};

export type TranscribeOptions = {
  /** Whisper model id; falls back to the service default when omitted. */
  model?: string;
  /** "auto" | "ja" | "en" — pinned automatically for Japanese-only models. */
  language?: string;
  /** Glossary terms to bias recognition. Skipped by models that refuse a prompt. */
  initialPrompt?: string;
  translate?: boolean;
  /** Called with each stage, for a status line. */
  onProgress?: (message: string) => void;
  signal?: AbortSignal;
};

type Job = {
  status: string;
  /** Added by the app's route: what it actually sent the audio to. */
  usedModel?: string;
  utterances?: Utterance[];
  detail?: string;
};

const POLL_MS = 4000;

/**
 * Run the recognition job and return its utterances.
 *
 * Throws with the service's own message on failure — the caller shows it, so it has to read
 * as a sentence rather than a status code.
 */
export async function transcribeRecording(
  meetingId: string,
  opts: TranscribeOptions = {},
): Promise<{ utterances: Utterance[]; usedModel?: string }> {
  const base = sttHttpBase();
  const { onProgress, signal } = opts;

  // Starting goes through the app's own server; polling below does not. The difference is a
  // credential: when recognition is being done by an HTTP provider, this request carries its
  // API key, which is read from settings.json server-side and must not pass through here. The
  // status endpoint needs nothing, so it stays a direct call.
  onProgress?.("Starting transcription…");
  const startRes = await fetch(`/api/meetings/${meetingId}/transcribe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      language: effectiveSttLanguage(opts.model, opts.language),
      model: opts.model,
      initialPrompt: opts.initialPrompt || undefined,
      translate: Boolean(opts.translate),
    }),
    signal,
  });
  if (!startRes.ok) {
    const d = await startRes.json().catch(() => null);
    throw new Error(
      d?.detail ?? d?.error ?? `Failed to start transcription (HTTP ${startRes.status})`,
    );
  }

  const started = (await startRes.json()) as Job;
  const usedModel = started.usedModel;
  let job = started;
  while (job.status === "running") {
    onProgress?.("Recognizing… this takes a few minutes, including loading the model.");
    await new Promise((r) => setTimeout(r, POLL_MS));
    if (signal?.aborted) throw new Error("Transcription was cancelled");
    const res = await fetch(`${base}/transcribe/${meetingId}/status`, { signal });
    job = (await res.json()) as Job;
  }
  if (job.status === "error") throw new Error(job.detail ?? "Transcription failed");
  if (job.status !== "done" || !Array.isArray(job.utterances)) {
    throw new Error("The transcription service returned an unexpected result");
  }
  return { utterances: job.utterances, usedModel };
}

/** Store recognised utterances as the meeting's transcript, replacing whatever is there. */
export async function applyTranscript(
  meetingId: string,
  utterances: Utterance[],
  /** What recognised them, as reported by the start call. Recorded on the meeting. */
  usedModel?: string,
): Promise<{ replaced: number }> {
  const res = await fetch(`/api/meetings/${meetingId}/apply-transcript`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ utterances, usedModel }),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => null);
    throw new Error(d?.error ?? `Failed to save the transcript (HTTP ${res.status})`);
  }
  return (await res.json()) as { replaced: number };
}
