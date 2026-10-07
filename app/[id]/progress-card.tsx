import { formatDurationIn } from "@/lib/i18n/format";
import { extensionEnabled } from "@/lib/extensions-store";
import { currentLocale } from "@/lib/i18n/server";
import { serverT } from "@/lib/i18n/server";

// Where this meeting has got to.
//
// Every one of these facts was already on the page, and none of them were in one place: you
// could tell a meeting had been transcribed by scrolling to the transcript, and that speakers
// had been separated by noticing the names were not "Speaker 1". The question people actually
// have — "is it finished, and what is left" — took reading the whole screen to answer.
//
// Separating and summarising are optional and can be run in either order, so they are shown as
// "not run" rather than "pending". A tick list that marks a step someone never intends to take
// as incomplete is nagging, not informing.
//
// Transcription and minutes show a running state, read from the queue, which knows which
// meeting each job is for. Separating speakers does not: it is started from this page, and the
// button that started it is where its progress is reported.

type Step = {
  label: string;
  state: "done" | "running" | "not-run";
  detail?: string;
};

function Mark({ state }: { state: Step["state"] }) {
  if (state === "done") return <span className="text-[var(--accent-sub)]">✓</span>;
  if (state === "running")
    return (
      <span className="inline-block size-2 animate-pulse rounded-full bg-[var(--accent-solid)]" aria-hidden />
    );
  return <span className="text-[var(--text-muted)]">○</span>;
}

export async function ProgressCard({
  ended,
  recordedMs,
  transcriptCount,
  separated,
  speakerCount,
  summaryCount,
  minutesRunning,
  transcribing = false,
}: {
  ended: boolean;
  recordedMs: number | null;
  transcriptCount: number;
  /** Whether diarization has been run: it leaves per-cluster embeddings behind, and that is
   *  the only signal that does not also fire for a recording whose speakers came from the
   *  audio source (mic vs PC) rather than from separating voices. */
  separated: boolean;
  /** Distinct speakers on the transcript. */
  speakerCount: number;
  summaryCount: number;
  /** Minutes queued or running, from the queue rather than from the meeting. */
  minutesRunning: boolean;
  /** A recognition queued or running for this meeting — a first one, or one replacing it. */
  transcribing?: boolean;
}) {
  const t = await serverT();
  const locale = await currentLocale();
  const speakersOn = await extensionEnabled("speakers");
  const steps: Step[] = [

    {
      label: t("Recorded"),
      state: ended || transcriptCount > 0 ? "done" : "not-run",
      detail: recordedMs ? (formatDurationIn(locale, recordedMs) ?? undefined) : undefined,
    },
    {
      label: transcribing ? t("Transcribing…") : t("Transcribed"),
      state: transcribing ? "running" : transcriptCount > 0 ? "done" : "not-run",
      detail:
        !transcribing && transcriptCount > 0
          ? t(transcriptCount === 1 ? "1 utterance" : "{n} utterances", { n: transcriptCount })
          : undefined,
    },
    ...(speakersOn
      ? [
          {
            label: t("Speakers separated"),
            state: separated ? ("done" as const) : ("not-run" as const),
            detail:
              separated && speakerCount > 0
                ? t(speakerCount === 1 ? "1 speaker" : "{n} speakers", { n: speakerCount })
                : undefined,
          },
        ]
      : []),
    {
      label: minutesRunning ? t("Writing minutes…") : t("Minutes"),
      state:
        minutesRunning ? "running" : summaryCount > 0 ? "done" : "not-run",
      detail:
        !minutesRunning && summaryCount > 1 ? `${summaryCount} versions` : undefined,
    },
  ];

  return (
    <section className="card p-4">
      <h2 className="mb-2 text-sm font-semibold text-[var(--text-strong)]">{t("Progress")}</h2>
      <ul className="flex flex-col gap-1.5 text-xs">
        {steps.map((s) => (
          <li key={s.label} className="flex items-baseline gap-2">
            <span className="w-3 shrink-0 text-center">
              <Mark state={s.state} />
            </span>
            <span className={s.state === "not-run" ? "text-[var(--text-muted)]" : ""}>{s.label}</span>
            {s.detail ? (
              <span className="ml-auto shrink-0 text-[var(--text-muted)]">{s.detail}</span>
            ) : null}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] text-[var(--text-muted)]">
        {speakersOn
          ? t("Separating speakers and writing minutes are optional, and can be run in either order.")
          : t("Writing minutes is optional.")}
      </p>
    </section>
  );
}
