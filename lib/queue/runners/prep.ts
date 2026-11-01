import { prisma } from "@/lib/prisma";
import { getPrepConfig, readEffectiveSettings } from "@/lib/settings";
import { providerFor } from "@/lib/llm/provider";
import { sttInternalUrl } from "@/lib/stt/internal";
import { RECORDING_KIND } from "@/lib/queue/types";
import {
  applyRun,
  parsePrep,
  prepPrompt,
  type Prep,
  readPrep,
  recentLines,
  spokenEnglish,
} from "@/lib/prep/prep";

// Questions and a running summary, as a queued job.
//
// Queued rather than run by the page, because the page may not be there: a phone recording with
// its screen off is a foreground service saving lines to the server, and nothing in a web view
// runs. Here it needs only the lines, which arrive whatever the screen is doing, and the owner's
// key, which a recording's hold keeps open.

/** A short answer: five lines of summary and a few questions. */
const ANSWER_TOKENS = 900;
/**
 * Loaded for a little longer than the runs are apart, so the next one does not spend most of its
 * time loading. Given back when the recording ends (`releaseRecording`).
 */
const KEEP_ALIVE = "6m";
/** Above this the recording is close to falling behind, and the card is left to it. */
const LIVE_RTF_LIMIT = 0.8;

async function recognitionBusy(meetingId: string): Promise<boolean> {
  const hold = await prisma.job.findFirst({
    where: { kind: RECORDING_KIND, meetingId, status: "running" },
    select: { id: true },
  });
  if (!hold) return false;
  try {
    const res = await fetch(`${sttInternalUrl()}/health`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return false;
    const { liveRtf } = (await res.json()) as { liveRtf?: number | null };
    return typeof liveRtf === "number" && liveRtf >= LIVE_RTF_LIMIT;
  } catch {
    // A service that does not answer is the recording's problem to report, not this job's.
    return false;
  }
}

async function save(meetingId: string, prep: Prep, throughAt?: Date) {
  const data = {
    body: JSON.stringify(prep),
    ranAt: new Date(),
    ...(throughAt ? { throughAt } : {}),
  };
  const found = await prisma.meetingPrep.findFirst({ where: { meetingId }, select: { meetingId: true } });
  if (found) await prisma.meetingPrep.update({ where: { meetingId }, data });
  else await prisma.meetingPrep.create({ data: { meetingId, ...data } });
}

const current = async (meetingId: string) => {
  const row = await prisma.meetingPrep.findFirst({ where: { meetingId } });
  return { prep: readPrep(row?.body), throughAt: row?.throughAt ?? null };
};

export async function runPrep(job: { meetingId: string | null }, signal?: AbortSignal) {
  const meetingId = job.meetingId;
  if (!meetingId) throw new Error("a prep job needs a meeting");
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    select: { title: true, description: true, sttLanguage: true },
  });
  if (!meeting) throw new Error("meeting not found");

  if (await recognitionBusy(meetingId)) {
    const { prep } = await current(meetingId);
    await save(meetingId, { ...prep, error: "Recognition needs the GPU right now, so this waits for the next update." });
    return { note: "left the card to the recording" };
  }

  const { prep, throughAt } = await current(meetingId);
  const rows = await prisma.transcript.findMany({
    where: { meetingId, ...(throughAt ? { createdAt: { gt: throughAt } } : {}) },
    orderBy: { createdAt: "asc" },
    select: { id: true, text: true, audioStartMs: true, createdAt: true },
  });
  if (rows.length === 0) {
    await save(meetingId, prep);
    return { note: "nothing new to read" };
  }

  const { lines, skipped } = recentLines(rows);
  const settings = await readEffectiveSettings();
  const language = settings.summaryLanguage === "en" ? "en" : "ja";
  const withEnglish = language !== "en" && spokenEnglish(lines, meeting.sttLanguage);
  const { system, user } = prepPrompt({
    title: meeting.title,
    description: meeting.description,
    language,
    withEnglish,
    prep,
    lines,
  });

  const cfg = await getPrepConfig();
  try {
    // No reasoning first: a thinking model spends the budget before the first line of JSON.
    const raw = await providerFor(cfg.provider).chat(
      { system, user, maxTokens: ANSWER_TOKENS, think: false, prefill: "{", keepAlive: KEEP_ALIVE },
      cfg,
      signal,
    );
    const answer = parsePrep(raw);
    if (!answer) throw new Error("The model's answer could not be read. It tries again at the next update.");
    // Times as the transcript shows them, counted from its first line, so "answered at 7:20" is
    // the line beside 7:20. The first line of a meeting is not at zero in the recording.
    const first = await prisma.transcript.findFirst({
      where: { meetingId, audioStartMs: { not: null } },
      orderBy: { createdAt: "asc" },
      select: { audioStartMs: true },
    });
    const zero = first?.audioStartMs ?? 0;
    const shown = lines.map((l) => ({
      ...l,
      audioStartMs: l.audioStartMs === null ? null : Math.max(0, l.audioStartMs - zero),
    }));
    const now = await current(meetingId);
    await save(meetingId, applyRun(now.prep, answer, shown, skipped, withEnglish), rows[rows.length - 1].createdAt);
    return { note: `read ${lines.length} line(s)` };
  } catch (e) {
    if (signal?.aborted) throw e;
    const now = await current(meetingId);
    await save(meetingId, { ...now.prep, error: e instanceof Error ? e.message : String(e) });
    throw e;
  }
}
