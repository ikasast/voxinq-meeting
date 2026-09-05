import { prisma } from "@/lib/prisma";
import { reindexAfterWrite } from "@/lib/crypto/reindex-hook";
import { parseEmbeddingModelId } from "@/lib/embedding-models";
import { getVoiceprintThreshold } from "@/lib/settings";
import { SELF_KEY, diarizerLabelToKey, isValidSpeakerKey, parseSpeakerLabels } from "@/lib/speakers";
import { cleanClusterEmbeddings, matchProfiles, parseEmbedding } from "@/lib/voiceprint";

// Writing a job's results into the meeting.
//
// These were the bodies of three API routes, which was fine while the browser was the thing
// that ran diarization and re-transcription: it started the job on the STT service, polled it,
// and posted the results back here. Now the queue runs them, and it is not going to make HTTP
// requests to itself to save its own results.
//
// The routes still exist and still do exactly this — they are how a browser mid-job on the old
// path finishes, and they are the natural shape for anything that computes results elsewhere.
// What changed is that the work is a function, so there are two callers instead of one.

export class MeetingWorkError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/**
 * Attach a speaker to each utterance.
 *
 * `speakers[i]` is the diarizer's label for the i-th utterance in creation order — the whole
 * mapping is positional, which is why `segments.json` on the STT side and the rows here have to
 * stay the same length. Where they are not, the overlap is applied and the caller is told both
 * counts rather than being failed: a partial attribution is more useful than none, and the
 * numbers are what make the mismatch visible.
 */
export async function applySpeakers(meetingId: string, speakers: string[]) {
  const transcripts = await prisma.transcript.findMany({
    where: { meetingId },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (transcripts.length === 0) throw new MeetingWorkError("no transcripts", 404);

  const n = Math.min(transcripts.length, speakers.length);
  const usedKeys = new Set<string>();
  const updates = [];
  for (let i = 0; i < n; i++) {
    const key = diarizerLabelToKey(speakers[i]); // "speakerN" -> "partner-N"
    if (!isValidSpeakerKey(key)) continue;
    usedKeys.add(key);
    updates.push(
      prisma.transcript.update({ where: { id: transcripts[i].id }, data: { speakerType: key } }),
    );
  }
  await prisma.$transaction(updates);

  return {
    updated: updates.length,
    transcriptCount: transcripts.length,
    speakerCount: speakers.length,
    speakerKeys: [...usedKeys].sort(),
  };
}

/**
 * Store a diarization run's per-cluster voiceprints, and name the clusters it recognises.
 *
 * A name the user already set is never overwritten: automatic naming is a suggestion, and the
 * person who typed a name has more information than the cosine distance does.
 */
export async function applyDiarizationEmbeddings(
  meetingId: string,
  rawEmbeddings: unknown,
  rawEmbeddingModel: unknown,
) {
  const clusters = cleanClusterEmbeddings(rawEmbeddings);
  // Which space these vectors are in — it comes from the diarizer, because the answer depends
  // on the STT host's hardware rather than on this build. Unrecognised parses to null, which
  // reads as pyannote, the same as a run from before the backends split.
  const clusterModel = parseEmbeddingModelId(rawEmbeddingModel);

  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    select: { id: true, speakerLabels: true },
  });
  if (!meeting) throw new MeetingWorkError("not found", 404);

  const labels = parseSpeakerLabels(meeting.speakerLabels);
  let matched: Record<string, string> = {};

  if (Object.keys(clusters).length > 0) {
    const rows = await prisma.speakerProfile.findMany({
      select: { name: true, embedding: true, embeddingModel: true },
    });
    const profiles = rows
      .map((r) => ({
        name: r.name,
        embedding: parseEmbedding(r.embedding),
        embeddingModel: r.embeddingModel,
      }))
      .filter((p): p is { name: string; embedding: number[]; embeddingModel: string | null } =>
        p.embedding !== null,
      );

    // Narrowed to the people who were in the meeting and expected to speak, when that is known.
    // Without it every enrolled profile is a candidate, so a cluster can be handed the name of
    // someone who was not in the room — and the more profiles exist, the likelier that becomes.
    const attending = await prisma.meetingParticipant.findMany({
      where: { meetingId, speaking: true },
      select: { name: true },
    });
    const expected = new Set(attending.map((p) => p.name));
    const candidates = expected.size > 0 ? profiles.filter((p) => expected.has(p.name)) : profiles;

    // Profiles from a different model are skipped rather than scored: with equal dimensions a
    // cross-model comparison returns an ordinary-looking number, not an error.
    const matches = matchProfiles(
      clusters,
      candidates,
      clusterModel,
      await getVoiceprintThreshold(),
    );
    for (const [cluster, m] of Object.entries(matches)) {
      const key = diarizerLabelToKey(cluster);
      if (!labels[key]?.trim()) {
        labels[key] = m.name;
        matched = { ...matched, [key]: m.name };
      }
    }
  }

  await prisma.meeting.update({
    where: { id: meetingId },
    data: {
      diarizationEmbeddings: Object.keys(clusters).length ? JSON.stringify(clusters) : null,
      // Stored beside them, so enrolling a profile from this meeting later still knows which
      // model the vectors belong to.
      diarizationEmbeddingModel: Object.keys(clusters).length ? clusterModel : null,
      speakerLabels: JSON.stringify(labels),
    },
  });

  return { labels, matched };
}

export type Utterance = { start: number; end: number; text: string; translation?: string | null };

/**
 * Replace the whole transcript with a fresh recognition.
 *
 * `createdAt` is reconstructed as "meeting start + the utterance's own offset", which is not
 * decoration: rows are ordered by it everywhere, and diarization maps speakers onto them by
 * index. Spaced by their audio offsets they come back in the order they were spoken; spaced by
 * the moment they were written they come back in the order recognition happened to finish.
 */
export async function applyTranscript(
  meetingId: string,
  utterances: Utterance[],
  usedModel?: string | null,
) {
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    select: { id: true, startedAt: true },
  });
  if (!meeting) throw new MeetingWorkError("not found", 404);
  if (utterances.length === 0) throw new MeetingWorkError("no utterances", 400);

  const base = meeting.startedAt.getTime();
  await prisma.$transaction([
    // What produced *this* transcript. The column was only ever written when the meeting was
    // created, so "Transcribed with" reported the model chosen back then however many times it
    // had been re-recognised since — and named a local model even when the work was done
    // somewhere else.
    ...(usedModel
      ? [prisma.meeting.update({ where: { id: meetingId }, data: { whisperModel: usedModel.slice(0, 120) } })]
      : []),
    prisma.transcript.deleteMany({ where: { meetingId } }),
    prisma.transcript.createMany({
      data: utterances.map((u, i) => ({
        meetingId,
        speakerType: SELF_KEY,
        text: u.text,
        translation: u.translation ?? null,
        audioStartMs: Math.round(u.start * 1000),
        audioEndMs: Math.round(u.end * 1000),
        createdAt: new Date(base + Math.round(u.start * 1000) + i),
      })),
    }),
  ]);

  await reindexAfterWrite(meetingId);

  const transcripts = await prisma.transcript.findMany({
    where: { meetingId },
    orderBy: { createdAt: "asc" },
  });
  return { replaced: transcripts.length, transcripts };
}
