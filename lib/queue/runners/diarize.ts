import { prisma } from "@/lib/prisma";
import { applyDiarizationEmbeddings, applySpeakers } from "@/lib/meetings/apply";
import { parseParams } from "../types";
import { sttPost, sttWait } from "./stt-job";

// Telling the speakers apart, as a queued job.
//
// The browser used to drive this: start on the STT service, poll it, then post the labels and
// the voiceprints back. Two consequences, both of which go away here. Closing the tab abandoned
// the run — the service finished and nothing applied the answer. And the browser had to be
// told to wait its turn, because it was the thing choosing when to start.

export type DiarizeParams = {
  /** How many voices to look for. Absent lets the diarizer decide, which it is worst at. */
  numSpeakers?: number;
};

export async function runDiarize(job: { meetingId: string | null; params: string }, signal?: AbortSignal) {
  const meetingId = job.meetingId;
  if (!meetingId) throw new Error("a diarize job needs a meeting");
  const { numSpeakers } = parseParams<DiarizeParams>(job.params);

  const qs = new URLSearchParams({ force: "true" });
  if (numSpeakers && numSpeakers > 0) qs.set("num_speakers", String(numSpeakers));

  await sttPost(`/diarize/${encodeURIComponent(meetingId)}?${qs}`);
  const result = await sttWait(`/diarize/${encodeURIComponent(meetingId)}/status`, signal);

  if (result.status === "error") throw new Error(String(result.detail ?? "diarization failed"));
  const speakers = result.speakers;
  if (!Array.isArray(speakers)) throw new Error("the diarizer returned no speakers");

  const applied = await applySpeakers(meetingId, speakers as string[]);

  // Voiceprints are best-effort: the speakers are already attached, and failing the job here
  // would throw that away over the naming step.
  try {
    await applyDiarizationEmbeddings(meetingId, result.embeddings ?? {}, result.embeddingModel);
  } catch (e) {
    console.error("[queue] voiceprint matching failed after diarization", e);
  }

  // Said rather than left to be noticed: one speaker where several were expected has causes the
  // person can act on, and the count is what makes it visible.
  const distinct = applied.speakerKeys.length;
  const missed = applied.transcriptCount - applied.speakerCount;
  const note =
    distinct <= 1 || missed > 0
      ? `Found ${distinct} speaker(s) across ${applied.transcriptCount} utterance(s).` +
        (missed > 0 ? ` ${missed} had no label.` : "") +
        " A short or one-sided recording, or a transcript that arrived as one block, gives the" +
        " diarizer little to separate."
      : undefined;

  return { note };
}

/** Ask the service to stop a run. Only diarization can actually be stopped mid-flight. */
export async function cancelDiarize(meetingId: string) {
  await sttPost(`/diarize/${encodeURIComponent(meetingId)}/cancel`).catch(() => {});
}

/** The recording a diarize job needs. Checked before queueing, so the refusal is immediate. */
export async function meetingHasTranscript(meetingId: string) {
  return (await prisma.transcript.count({ where: { meetingId } })) > 0;
}
