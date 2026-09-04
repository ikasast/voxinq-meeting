import { sttInternalUrl } from "@/lib/stt/internal";

// Both of the jobs that run on the STT service have the same shape: post to start, then ask
// until it stops saying "running". The shape lives here once so the two runners are about what
// they do with the answer.
//
// The polling is server-side now. It used to be the browser's: it started the job, watched it,
// and posted the results back. That meant closing the tab abandoned the run — the work carried
// on and its results were never applied, which reads as diarization silently not happening.

/** Long enough for an hour of audio on a slow CPU, short enough that a wedged job ends. */
const MAX_WAIT_MS = 3 * 60 * 60 * 1000;
const POLL_MS = 3000;

export type SttJobStatus = {
  status: string;
  detail?: string;
  note?: string;
  [k: string]: unknown;
};

export async function sttPost(path: string, body?: unknown): Promise<SttJobStatus> {
  const res = await fetch(`${sttInternalUrl()}${path}`, {
    method: "POST",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text();
  let parsed: SttJobStatus | null = null;
  try {
    parsed = JSON.parse(text) as SttJobStatus;
  } catch {
    /* not JSON — the message below carries the body instead */
  }
  if (!res.ok) {
    throw new Error(parsed?.detail ?? `${path} returned ${res.status}: ${text.slice(0, 200)}`);
  }
  return parsed ?? { status: "unknown" };
}

/**
 * Ask until it is no longer running.
 *
 * `signal` is the job's — aborting stops the waiting, not the work. Only diarization can
 * actually be stopped on the service (`/diarize/{id}/cancel`); a recognition pass runs to its
 * end and its result is discarded. Better that than pretending, and better than blocking a
 * cancel on a service that has no way to honour it.
 */
export async function sttWait(statusPath: string, signal?: AbortSignal): Promise<SttJobStatus> {
  const until = Date.now() + MAX_WAIT_MS;
  for (;;) {
    if (signal?.aborted) throw new Error("cancelled");
    const res = await fetch(`${sttInternalUrl()}${statusPath}`, {
      signal: AbortSignal.timeout(30_000),
    });
    const job = (await res.json()) as SttJobStatus;
    if (job.status !== "running") return job;
    if (Date.now() > until) throw new Error("the transcription service did not finish in time");
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}
