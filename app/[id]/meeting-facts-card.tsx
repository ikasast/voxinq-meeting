import Link from "next/link";

// The settings this meeting was actually recorded and written with.
//
// They were only visible by opening Settings, which shows what is configured *now* — not what
// this meeting used. A meeting recorded with a different model, or written by a different LLM,
// or shaped by a series' own format and glossary, otherwise gives no way to tell.
export function MeetingFactsCard({
  whisperModel,
  sttLanguage,
  defaultWhisperModel,
  series,
  latestSummary,
}: {
  whisperModel: string | null;
  sttLanguage: string | null;
  defaultWhisperModel: string;
  series: { id: string; name: string; summaryFormat: string | null; glossary: string | null } | null;
  latestSummary: { provider: string | null; model: string | null } | null;
}) {
  const rows: { label: string; value: React.ReactNode }[] = [
    {
      label: "Transcribed with",
      value: whisperModel ?? (
        <>
          {defaultWhisperModel} <span className="text-[var(--text-muted)]">(default)</span>
        </>
      ),
    },
  ];
  if (sttLanguage && sttLanguage !== "auto") rows.push({ label: "Language", value: sttLanguage });
  if (latestSummary?.model) {
    rows.push({
      label: "Minutes by",
      value: latestSummary.provider
        ? `${latestSummary.provider} / ${latestSummary.model}`
        : latestSummary.model,
    });
  }

  return (
    <section className="card p-4">
      <h2 className="mb-2 text-sm font-semibold text-[var(--text-strong)]">This meeting</h2>
      <dl className="flex flex-col gap-1.5 text-xs">
        {rows.map((r) => (
          <div key={r.label} className="flex gap-2">
            <dt className="w-28 shrink-0 text-[var(--text-muted)]">{r.label}</dt>
            <dd className="min-w-0 break-words">{r.value}</dd>
          </div>
        ))}
      </dl>

      {series ? (
        <div className="mt-3 border-t border-[var(--border)] pt-3">
          <div className="flex gap-2 text-xs">
            <dt className="w-28 shrink-0 text-[var(--text-muted)]">Series</dt>
            <dd className="min-w-0">
              <Link
                href={`/series/${series.id}`}
                className="inline-flex items-center gap-1 text-[var(--accent-sub)] hover:underline"
                title="Open the series page (timeline & defaults)"
              >
                ↻ {series.name}
              </Link>
            </dd>
          </div>
          {/* Why this meeting's minutes are shaped the way they are, and why those proper nouns
              came out right — both live on the series and were invisible from here. */}
          {series.summaryFormat ? (
            <p className="mt-1.5 text-xs text-[var(--text-muted)]">
              Uses this series&rsquo; own minutes format.
            </p>
          ) : null}
          {series.glossary?.trim() ? (
            <div className="mt-1.5 flex gap-2 text-xs">
              <dt className="w-28 shrink-0 text-[var(--text-muted)]">Glossary</dt>
              <dd className="min-w-0 break-words text-[var(--text-secondary)]">
                {series.glossary.trim()}
              </dd>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
