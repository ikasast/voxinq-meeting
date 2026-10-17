import { extensionEnabled } from "@/lib/extensions-store";
import { prisma } from "@/lib/prisma";
import { getLlmConfig, readEffectiveSettings } from "@/lib/settings";
import { CONTEXT_BUDGET, estTokens, ollamaContextBudget, providerFor } from "@/lib/llm/provider";
import { nameOf, readNames } from "@/lib/speakers";
import { formatOffset } from "@/lib/utils";
import { defaultCriteria, isReviewRole, overallScore, type ReviewRole } from "@/lib/review/criteria";
import { reviewMetrics } from "@/lib/review/metrics";
import { focusLines, parseReview, reviewSystemPrompt, reviewUserPrompt, type ReviewLine } from "@/lib/review/prompt";
import { parseParams } from "../types";

// Meeting feedback (an extension), as a queued job: one person's part in a meeting — as its
// facilitator or as a participant — scored against their criteria and written up by the minutes
// model. Queued like the minutes because on a local model it is the same use of the card.

export type ReviewParams = { role: ReviewRole; person: string };

const ANSWER_TOKENS = 1600;

export async function runReview(job: { meetingId: string | null; params: string }, signal?: AbortSignal) {
  if (!(await extensionEnabled("review"))) throw new Error("Meeting feedback is switched off.");
  const meetingId = job.meetingId;
  if (!meetingId) throw new Error("a feedback job needs a meeting");
  const { role, person } = parseParams<ReviewParams>(job.params);
  if (!isReviewRole(role) || typeof person !== "string" || !person.trim()) throw new Error("invalid feedback request");

  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    select: {
      description: true,
      speakerLabels: true,
      seriesId: true,
      summaries: { orderBy: { createdAt: "desc" }, take: 1, select: { summaryText: true } },
      participants: { orderBy: [{ position: "asc" }, { createdAt: "asc" }], select: { name: true } },
    },
  });
  if (!meeting) throw new Error("meeting not found");

  const names = readNames(meeting.speakerLabels);
  const rows = await prisma.transcript.findMany({
    where: { meetingId },
    orderBy: { createdAt: "asc" },
    select: { id: true, speakerType: true, text: true, audioStartMs: true, audioEndMs: true },
  });
  const firstMs = rows.find((r) => typeof r.audioStartMs === "number")?.audioStartMs ?? 0;
  const lines = rows.map((r) => ({
    id: r.id,
    speaker: nameOf(r.speakerType, names),
    text: r.text,
    startSec: typeof r.audioStartMs === "number" ? r.audioStartMs / 1000 : null,
    endSec: typeof r.audioEndMs === "number" ? r.audioEndMs / 1000 : null,
  }));
  // The person is who the page showed: a name some line is spoken under.
  if (!lines.some((l) => l.speaker === person)) throw new Error("Nobody of that name speaks in this meeting.");

  const settings = await readEffectiveSettings();
  const language = settings.summaryLanguage === "en" ? "en" : "ja";
  const stored = role === "facilitator" ? settings.facilitatorCriteria : settings.participantCriteria;
  const criteria = stored.length > 0 ? stored : defaultCriteria(role, language);

  const metrics = reviewMetrics(lines, person);
  const cfg = await getLlmConfig();
  const system = reviewSystemPrompt(role, language);
  const minutes = meeting.summaries[0]?.summaryText ?? "";
  // What is left for the lines once the instructions, the minutes and the answer have their room.
  // Counted in characters, which for Japanese is about a token each and errs on the safe side.
  // The window in force: for Ollama, the one set under Settings when there is one.
  const budget = cfg.provider === "ollama" ? ollamaContextBudget(cfg.ollamaNumCtx) : CONTEXT_BUDGET[cfg.provider];
  const room =
    budget - ANSWER_TOKENS - estTokens(system) - estTokens(minutes) - estTokens(meeting.description ?? "") - 1500;
  const shownLines: ReviewLine[] = lines.map((l) => ({
    id: l.id,
    speaker: l.speaker,
    text: l.text,
    at: l.startSec !== null ? formatOffset(l.startSec - firstMs / 1000) : null,
  }));
  const { lines: shown, focused } = focusLines(shownLines, person, Math.max(2000, room));

  const user = reviewUserPrompt({
    role,
    person,
    language,
    criteria,
    metrics,
    purpose: meeting.description ?? undefined,
    minutes: minutes || undefined,
    lines: shown,
    focused,
  });
  const answer = await providerFor(cfg.provider).chat(
    // A JSON object, not an essay: a reasoning model left to think spends the budget on it.
    { system, user, maxTokens: ANSWER_TOKENS, think: false },
    cfg,
    signal,
  );
  const result = parseReview(answer, criteria, shown);
  if (!result) throw new Error("The model's answer could not be read as feedback. Try again, or with another model.");

  const score = overallScore(
    criteria,
    Object.fromEntries(result.criteria.map((c) => [c.id, c.score])),
  );
  const model = cfg.provider === "ollama" ? cfg.ollamaModel : cfg.provider === "anthropic" ? cfg.anthropicModel : cfg.openaiModel;
  await prisma.meetingReview.create({
    data: {
      meetingId,
      role,
      person,
      score,
      result: JSON.stringify(result),
      criteria: JSON.stringify(criteria),
      metrics: JSON.stringify(metrics),
      participants: JSON.stringify(meeting.participants.map((p) => p.name)),
      seriesId: meeting.seriesId,
      model,
    },
  });
  return { note: `${person}: ${score}` };
}
