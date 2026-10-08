import { extensionEnabled } from "@/lib/extensions-store";
import { prisma } from "@/lib/prisma";
import { sttPost, sttWait } from "./stt-job";

// Emotion (an extension): what each line sounded like — neutral, joy, anger or sadness — judged
// from the voice by stt-service/emotion.py, as a queued job. It runs on the card like diarization,
// so it waits its turn and gives way to a recording.
//
// Every line with a place in the recording is asked about; what comes back is stored on the line
// (transcripts.emotion) as the four probabilities, and the page shows only a line where one of
// the three that are not "neutral" is clear (lib/emotion.ts).

export async function runEmotion(job: { meetingId: string | null }, signal?: AbortSignal) {
  if (!(await extensionEnabled("emotion"))) throw new Error("Emotion is switched off.");
  const meetingId = job.meetingId;
  if (!meetingId) throw new Error("an emotion job needs a meeting");

  const lines = await prisma.transcript.findMany({
    where: { meetingId },
    orderBy: { createdAt: "asc" },
    select: { id: true, audioStartMs: true, audioEndMs: true },
  });
  const placed = lines.filter(
    (l) => typeof l.audioStartMs === "number" && typeof l.audioEndMs === "number" && l.audioEndMs > l.audioStartMs,
  );
  if (placed.length === 0) throw new Error("No line has a place in the recording to judge.");

  await sttPost(`/emotion/${encodeURIComponent(meetingId)}`, {
    utterances: placed.map((l) => ({ start: l.audioStartMs! / 1000, end: l.audioEndMs! / 1000 })),
  });
  const result = await sttWait(`/emotion/${encodeURIComponent(meetingId)}/status`, signal);
  if (result.status !== "done") {
    if (result.code === "no_torch") {
      throw new Error("Emotion needs the NVIDIA GPU build of the transcription service, which has torch.");
    }
    if (result.code === "hf_token_required") {
      throw new Error("Emotion needs HF_TOKEN, with the terms of its two models accepted on Hugging Face.");
    }
    throw new Error(String(result.detail ?? "emotion failed"));
  }
  const answers = Array.isArray(result.lines) ? (result.lines as ({ probs?: number[] } | null)[]) : [];

  const byId = new Map(placed.map((l, i) => [l.id, answers[i]?.probs ?? null]));
  // Every line written, judged or not: an answer from an earlier run describes lines as they were.
  await prisma.$transaction(
    lines.map((l) => {
      const probs = byId.get(l.id);
      return prisma.transcript.update({
        where: { id: l.id },
        data: { emotion: Array.isArray(probs) && probs.length === 4 ? JSON.stringify({ probs }) : null },
      });
    }),
  );
  const judged = [...byId.values()].filter(Boolean).length;
  return { note: `${judged} of ${lines.length} lines` };
}

export async function cancelEmotion(meetingId: string) {
  await sttPost(`/emotion/${encodeURIComponent(meetingId)}/cancel`).catch(() => {});
}
