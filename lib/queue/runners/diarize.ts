import { prisma } from "@/lib/prisma";
import {
  applyDiarizationEmbeddings,
  applySpeakers,
  applySpeakersToRows,
  spansForDiarization,
} from "@/lib/meetings/apply";
import {
  type SplitPiece,
  applySplits,
  asRecognised,
  planSplits,
  undoSplits,
  withCurrentText,
} from "@/lib/meetings/split";
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

  // Which lines to ask about: the rows' own places in the recording, so each answer comes
  // back attached to the row it is about. Null means this recording has to be asked the old
  // way, about the boundaries the service saved, and answered by position.
  //
  // The lines as they were recognised, not the pieces an earlier run cut them into: asked about
  // those, a second run would divide one again — a piece of a piece, which Undo split could not
  // put back, stamped a millisecond after its parent where its siblings already were.
  const stored = await prisma.transcript.findMany({
    where: { meetingId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      text: true,
      createdAt: true,
      audioStartMs: true,
      audioEndMs: true,
      splitOfId: true,
    },
  });
  const rows = asRecognised(stored);
  const spans = spansForDiarization(rows);

  await sttPost(
    `/diarize/${encodeURIComponent(meetingId)}?${qs}`,
    spans ? { utterances: spans } : undefined,
  );
  const result = await sttWait(`/diarize/${encodeURIComponent(meetingId)}/status`, signal);

  if (result.status === "error") throw new Error(String(result.detail ?? "diarization failed"));
  const speakers = result.speakers;
  if (!Array.isArray(speakers)) throw new Error("the diarizer returned no speakers");

  const labels = speakers as string[];
  // Only now, with an answer in hand, does the transcript change: an earlier division goes back
  // together, and this answer is applied to the lines it was about. A run that failed above
  // left everything as it was.
  if (rows.length !== stored.length) await undoSplits(meetingId);
  const applied = spans
    ? await applySpeakersToRows(
        meetingId,
        rows.slice(0, labels.length).map((r, i) => ({ id: r.id, speaker: labels[i] })),
      )
    : await applySpeakers(meetingId, labels);

  // A line is cut where the room goes quiet, so a quick exchange lands in one of them. Where
  // the words show the speaker changing inside a line, it is divided between them. Only on the
  // by-time path: the pieces are about the spans that were sent.
  //
  // Judged against the lines as they are now, not as they were when the run began: somebody may
  // have corrected one while the diarizer worked, and pieces of the old words must not be
  // written back over the correction.
  let divided = { split: 0, added: 0 };
  if (spans && Array.isArray(result.pieces)) {
    const now = await prisma.transcript.findMany({
      where: { meetingId },
      select: { id: true, text: true },
    });
    const current = withCurrentText(rows, now);
    divided = await applySplits(meetingId, current, planSplits(current, result.pieces as (SplitPiece[] | null)[]));
  }

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
  const trouble =
    distinct <= 1 || missed > 0
      ? `Found ${distinct} speaker(s) across ${applied.transcriptCount} utterance(s).` +
        (missed > 0 ? ` ${missed} had no label.` : "") +
        " A short or one-sided recording, or a transcript that arrived as one block, gives the" +
        " diarizer little to separate."
      : undefined;
  // Worth saying even when nothing went wrong: the transcript has more lines than it did, and
  // that is something a person will notice and want explained.
  const divisions =
    divided.split > 0
      ? `${divided.split} utterance(s) held more than one speaker and were divided, adding` +
        ` ${divided.added} line(s).`
      : undefined;
  const note = [trouble, divisions].filter(Boolean).join(" ") || undefined;

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
