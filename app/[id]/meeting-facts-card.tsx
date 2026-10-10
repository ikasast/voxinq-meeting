import { serverT } from "@/lib/i18n/server";
import { extensionEnabled } from "@/lib/extensions-store";
import { PROPS_WIDE } from "./property";

// The settings this meeting was actually recorded and written with.
//
// They were only visible by opening Settings, which shows what is configured *now* — not what
// this meeting used. A meeting recorded with a different model, or written by a different LLM,
// or shaped by a series' own format and glossary, otherwise gives no way to tell.
//
// The last row of the meeting's details (property.tsx), folded: it answers a question asked
// rarely, and the series itself already has a row of its own above.
export async function MeetingFacts({
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
  const t = await serverT();
  const rows: { label: string; value: React.ReactNode }[] = [
    {
      label: t("Transcribed with"),
      value: whisperModel ?? (
        <>
          {defaultWhisperModel} <span className="text-[var(--text-muted)]">({t("default")})</span>
        </>
      ),
    },
  ];
  if (sttLanguage && sttLanguage !== "auto") rows.push({ label: t("Language"), value: sttLanguage });
  if (latestSummary?.model) {
    rows.push({
      label: t("Minutes by"),
      value: latestSummary.provider
        ? `${latestSummary.provider} / ${latestSummary.model}`
        : latestSummary.model,
    });
  }

  if (series && (await extensionEnabled("series"))) {
    // Why this meeting's minutes are shaped the way they are, and why those proper nouns came
    // out right — both live on the series and were invisible from here.
    if (series.summaryFormat && (await extensionEnabled("minutesFormats"))) {
      rows.push({ label: t("Format"), value: t("Uses this series’ own minutes format.") });
    }
    if (series.glossary?.trim()) rows.push({ label: t("Glossary"), value: series.glossary.trim() });
  }

  return (
    <details className={`${PROPS_WIDE} group`}>
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-xs text-[var(--text-muted)] hover:text-[var(--foreground)] [&::-webkit-details-marker]:hidden">
        <span aria-hidden className="transition-transform group-open:rotate-90">
          ›
        </span>
        {t("Models, language and glossary")}
      </summary>
      <dl className="mt-2 grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-xs">
        {rows.map((r) => (
          <div key={r.label} className="contents">
            <dt className="text-[var(--text-muted)]">{r.label}</dt>
            <dd className="min-w-0 break-words text-[var(--text-secondary)]">{r.value}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
