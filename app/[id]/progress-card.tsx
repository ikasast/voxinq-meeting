import { formatDurationMs } from "@/lib/utils";

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
// Only minutes shows a running state. The STT service reports that it is diarizing, but not
// *which* meeting it is diarizing, and this card sits on one particular meeting -- claiming a
// different meeting's work as this one's would be worse than saying nothing.

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

export function ProgressCard({
  ended,
  recordedMs,
  transcriptCount,
  separated,
  speakerCount,
  summaryCount,
  summaryStatus,
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
  summaryStatus: string | null;
}) {
  const steps: Step[] = [
    {
      label: "Recorded",
      state: ended || transcriptCount > 0 ? "done" : "not-run",
      detail: recordedMs ? (formatDurationMs(recordedMs) ?? undefined) : undefined,
    },
    {
      label: "Transcribed",
      state: transcriptCount > 0 ? "done" : "not-run",
      detail: transcriptCount > 0 ? `${transcriptCount} utterances` : undefined,
    },
    {
      label: "Speakers separated",
      state: separated ? "done" : "not-run",
      detail: separated && speakerCount > 0 ? `${speakerCount} speakers` : undefined,
    },
    {
      label: summaryStatus === "processing" ? "Writing minutes…" : "Minutes",
      state:
        summaryStatus === "processing" ? "running" : summaryCount > 0 ? "done" : "not-run",
      detail:
        summaryStatus !== "processing" && summaryCount > 1 ? `${summaryCount} versions` : undefined,
    },
  ];

  return (
    <section className="card p-4">
      <h2 className="mb-2 text-sm font-semibold text-[var(--text-strong)]">Progress</h2>
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
        Separating speakers and writing minutes are optional, and can be run in either order.
      </p>
    </section>
  );
}
