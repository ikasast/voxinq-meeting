import { prisma } from "@/lib/prisma";
import { requestSummary } from "@/lib/llm";
import { beginGeneration, endGeneration } from "@/lib/llm/generation-registry";
import { resolveTemplate } from "@/lib/minutes-templates";
import { getLlmConfig, readSettings } from "@/lib/settings";
import { parseSpeakerLabels } from "@/lib/speakers";
import { type MinutesParams, parseParams } from "../types";

// Writing the minutes, as a queued job.
//
// This was the body of an `after()` in the route that started it, which meant the work began
// the moment the request arrived and the transcript it used was the one read at that moment.
// Here it is read when the job runs. That is the more correct of the two: a job can now wait
// behind something, and an utterance corrected while it waited should be in the minutes.
//
// What is deliberately kept: the abort registry. `/api/claude/summary/abort` uses it to free
// the GPU for a recording that has to start now, and that has to keep working before the
// queue learns to preempt on its own.

export async function runMinutes(job: { id: string; meetingId: string | null; params: string }) {
  const meetingId = job.meetingId;
  if (!meetingId) throw new Error("a minutes job needs a meeting");
  const { detail, provider, templateId } = parseParams<MinutesParams>(job.params);

  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    select: {
      id: true,
      description: true,
      speakerLabels: true,
      seriesId: true,
      startedAt: true,
      series: { select: { summaryFormat: true } },
    },
  });
  if (!meeting) throw new Error("meeting not found");

  const transcripts = await prisma.transcript.findMany({
    where: { meetingId },
    orderBy: { createdAt: "asc" },
    select: { speakerType: true, text: true, createdAt: true },
  });
  // Checked at enqueue too, so this is the case where every line was deleted while the job
  // waited. Nothing to write, and an empty prompt would invent a meeting.
  if (transcripts.length === 0) throw new Error("No utterances recorded");

  // The previous meeting's minutes, as reference material for "continuing from last time".
  let previousMinutes: { title: string; date: string; text: string } | undefined;
  if (meeting.seriesId) {
    const prev = await prisma.meeting.findFirst({
      where: {
        seriesId: meeting.seriesId,
        deletedAt: null,
        id: { not: meeting.id },
        startedAt: { lt: meeting.startedAt },
        summaries: { some: {} },
      },
      orderBy: { startedAt: "desc" },
      select: {
        title: true,
        startedAt: true,
        summaries: { orderBy: { createdAt: "desc" }, take: 1, select: { summaryText: true } },
      },
    });
    if (prev?.summaries[0]) {
      previousMinutes = {
        title: prev.title,
        date: prev.startedAt.toISOString().slice(0, 10),
        text: prev.summaries[0].summaryText,
      };
    }
  }

  const ac = beginGeneration(meetingId);
  try {
    const settings = await readSettings();
    const summaryText = await requestSummary(
      transcripts,
      {
        description: meeting.description,
        speakerLabels: parseSpeakerLabels(meeting.speakerLabels),
        detail,
        provider,
        format: resolveTemplate(settings.minutesTemplates, {
          chosenId: templateId,
          seriesFormat: meeting.series?.summaryFormat,
          defaultId: settings.defaultMinutesTemplateId,
        }),
        previousMinutes,
      },
      ac.signal,
    );

    // Which provider and model actually wrote it — mirrors how requestSummary resolves them:
    // a valid override wins, otherwise the saved setting.
    const cfg = await getLlmConfig();
    const effProvider =
      provider && ["ollama", "anthropic", "openai"].includes(provider)
        ? (provider as typeof cfg.provider)
        : cfg.provider;
    const effModel =
      effProvider === "ollama"
        ? cfg.ollamaModel
        : effProvider === "anthropic"
          ? cfg.anthropicModel
          : cfg.openaiModel;

    await prisma.meetingSummary.create({
      data: { meetingId, summaryText, provider: effProvider, model: effModel },
    });
    await prisma.meeting.update({ where: { id: meetingId }, data: { summaryStatus: "done" } });
    return { aborted: false as const };
  } catch (e) {
    const aborted = ac.signal.aborted || (e instanceof Error && e.name === "AbortError");
    // Aborted on purpose — to free the GPU for a recording. Say that rather than "AbortError",
    // and leave it regenerable.
    const reason = aborted
      ? "Minutes generation was stopped. You can regenerate them."
      : summarise(e);
    if (!aborted) console.error("summary generation failed", e);
    await prisma.meeting
      .update({
        where: { id: meetingId },
        data: { summaryStatus: "error", summaryError: reason },
      })
      .catch(() => {});
    return { aborted, reason };
  } finally {
    endGeneration(meetingId, ac);
  }
}

/** The network-level cause too: the top-level message often hides UND_ERR_HEADERS_TIMEOUT. */
function summarise(e: unknown): string {
  const cause = e instanceof Error && e.cause instanceof Error ? ` (${e.cause.message})` : "";
  return `${e instanceof Error ? e.message : String(e)}${cause}`.slice(0, 300);
}
