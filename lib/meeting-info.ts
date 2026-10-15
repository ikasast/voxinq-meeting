import { type Locale, translate } from "@/lib/i18n";
import { formatDateTimeIn, formatDurationIn } from "@/lib/i18n/format";

// The meeting's details that head its minutes wherever they are taken — the Word file, the
// Markdown file, the printed sheet, the clipboard: when it was, who was there, and its series.
// The same rows as the top of the meeting's page, less the speakers, which are the participants
// again, and less the purpose, which the minutes themselves open with.

export type MeetingInfoInput = {
  startedAt: Date;
  endedAt: Date | null;
  participants: string[];
  /** Only when the Series extension is on. */
  series: string | null;
};

export type MeetingInfoRow = { label: string; value: string };

export function meetingInfoRows(m: MeetingInfoInput, locale: Locale): MeetingInfoRow[] {
  const t = (key: string) => translate(locale, key);
  const duration = m.endedAt ? formatDurationIn(locale, m.endedAt.getTime() - m.startedAt.getTime()) : null;
  const when =
    formatDateTimeIn(locale, m.startedAt) +
    (m.endedAt ? ` – ${formatDateTimeIn(locale, m.endedAt)}` : "") +
    (duration ? ` (${duration})` : "");
  const rows: MeetingInfoRow[] = [{ label: t("When"), value: when }];
  if (m.participants.length > 0) {
    rows.push({ label: t("Participants"), value: m.participants.join(t(", ")) });
  }
  if (m.series) rows.push({ label: t("Series"), value: m.series });
  return rows;
}

/** The minutes as one Markdown text: the title, the details as a list, then the minutes. */
export function minutesWithInfo(title: string, rows: MeetingInfoRow[], minutes: string): string {
  const info = rows.map((r) => `- **${r.label}:** ${r.value}`).join("\n");
  return `# ${title}\n\n${info}\n\n---\n\n${minutes.trim()}\n`;
}
