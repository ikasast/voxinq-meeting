import { prisma } from "@/lib/prisma";
import { reindexAfterWrite } from "@/lib/crypto/reindex-hook";
import { writeMinutes } from "@/lib/llm";
import { loadedModel } from "@/lib/llm/ollama-models";
import { emptyUsage } from "@/lib/llm/types";
import { beginGeneration, endGeneration } from "@/lib/llm/generation-registry";
import { resolveInstructions, resolveTemplate } from "@/lib/minutes-templates";
import { resolveInclude } from "@/lib/minutes-context";
import { gatherMinutesContext } from "@/lib/minutes-context-data";
import { readExtensions } from "@/lib/extensions-store";
import { getLlmConfig, readEffectiveSettings } from "@/lib/settings";
import { readNames } from "@/lib/speakers";
import type { JobMetrics } from "../metrics";
import { type MinutesParams, parseParams, STOPPED_REASON } from "../types";

// Writing the minutes, as a queued job.
//
// This was the body of an `after()` in the route that started it, which meant the work began
// the moment the request arrived and the transcript it used was the one read at that moment.
// Here it is read when the job runs. That is the more correct of the two: a job can now wait
// behind something, and an utterance corrected while it waited should be in the minutes.
//
// What is deliberately kept: the abort registry. A recording that has to start now uses it
// (lib/queue/recording.ts) to free the GPU without taking the rest of the queue with it.

export async function runMinutes(job: { id: string; meetingId: string | null; params: string }) {
  const meetingId = job.meetingId;
  if (!meetingId) throw new Error("a minutes job needs a meeting");
  const asked = parseParams<MinutesParams>(job.params);
  // A run asked for before an extension was switched off is written as it now would be: by
  // Ollama, in the built-in format, given what that format is given.
  const extensions = await readExtensions();
  const provider = extensions.externalAi ? asked.provider : undefined;
  const templateId = extensions.minutesFormats ? asked.templateId : undefined;
  const include = extensions.minutesFormats ? asked.include : undefined;

  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    select: {
      speakerLabels: true,
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

  // What else it is given: what this run chose, or else what its template has on by default.
  const ctx = await gatherMinutesContext(meetingId);
  if (!ctx) throw new Error("meeting not found");
  const settings = await readEffectiveSettings();
  const given = new Set(
    include ??
      resolveInclude(settings.minutesTemplates, {
        chosenId: templateId,
        defaultId: settings.defaultMinutesTemplateId,
      }),
  );

  // Which provider and model will write it — mirrors how writeMinutes resolves them: a valid
  // override wins, otherwise the saved setting. Worked out before the run so that a failure
  // records it too.
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
  const usage = emptyUsage();
  // What the run cost, read back after it: the calls' own figures, and — for a local model —
  // how much of it Ollama managed to hold on the GPU, which is the difference between a set of
  // minutes that takes two minutes and one that takes twenty.
  const measure = async (): Promise<JobMetrics> => {
    const m: JobMetrics = { provider: effProvider, model: effModel };
    if (usage.calls > 0) Object.assign(m, usage);
    if (effProvider === "ollama") {
      const held = await loadedModel(cfg.ollamaBaseUrl.replace(/\/+$/, ""), effModel);
      if (held) {
        m.loadedMb = held.sizeMb;
        m.gpuMb = held.vramMb;
        if (held.contextLength) m.numCtx = held.contextLength;
      }
    }
    return m;
  };

  const ac = beginGeneration(meetingId);
  try {
    const summaryText = await writeMinutes(
      transcripts,
      {
        meeting: {
          title: given.has("meeting") ? ctx.meeting.title : undefined,
          when: given.has("meeting") ? ctx.meeting.when : undefined,
          participants: given.has("participants") ? ctx.participants : undefined,
        },
        description: given.has("purpose") ? ctx.purpose : undefined,
        glossary: given.has("glossary") ? ctx.glossary : undefined,
        seriesBackground: given.has("series") ? ctx.series : undefined,
        previousMinutes: given.has("previous") ? (ctx.previous ?? undefined) : undefined,
        background: given.has("background") ? ctx.background : undefined,
        speakerLabels: readNames(meeting.speakerLabels),
        provider,
        format: resolveTemplate(settings.minutesTemplates, {
          chosenId: templateId,
          seriesFormat: extensions.minutesFormats ? meeting.series?.summaryFormat : undefined,
          defaultId: settings.defaultMinutesTemplateId,
        }),
        instructions: resolveInstructions(settings.minutesTemplates, {
          chosenId: templateId,
          defaultId: settings.defaultMinutesTemplateId,
        }),
        usage,
      },
      ac.signal,
    );

    await prisma.meetingSummary.create({
      data: { meetingId, summaryText, provider: effProvider, model: effModel },
    });
    await prisma.meeting.update({ where: { id: meetingId }, data: { summaryStatus: "done" } });
    // Minutes are searched too, so the index has to include them.
    await reindexAfterWrite(meetingId);
    return { aborted: false as const, metrics: await measure() };
  } catch (e) {
    const aborted = ac.signal.aborted || (e instanceof Error && e.name === "AbortError");
    // Aborted on purpose — to free the GPU for a recording. Say that rather than "AbortError",
    // and leave it regenerable.
    const reason = aborted ? STOPPED_REASON : summarise(e);
    if (!aborted) console.error("summary generation failed", e);
    await prisma.meeting
      .update({
        where: { id: meetingId },
        data: { summaryStatus: "error", summaryError: reason },
      })
      .catch(() => {});
    return { aborted, reason, metrics: await measure() };
  } finally {
    endGeneration(meetingId, ac);
  }
}

/** The network-level cause too: the top-level message often hides UND_ERR_HEADERS_TIMEOUT. */
function summarise(e: unknown): string {
  const cause = e instanceof Error && e.cause instanceof Error ? ` (${e.cause.message})` : "";
  return `${e instanceof Error ? e.message : String(e)}${cause}`.slice(0, 300);
}
