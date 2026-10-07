import { prisma } from "@/lib/prisma";
import { extensionEnabled } from "./extensions-store";
import { readSettings } from "@/lib/settings";
import { joinGlossary } from "@/lib/stt/transcribe-defaults";
import type { ContextKey } from "./minutes-context";

// The seven pieces of context, read from a meeting (see lib/minutes-context.ts).
//
// One reader for both the job that writes the minutes and the panel that shows what it would
// be given, so what is previewed is what is sent.

export type MinutesContext = {
  meeting: { title: string; when: string };
  participants: string[];
  purpose: string;
  glossary: string;
  series: string;
  previous: { title: string; date: string; text: string } | null;
  background: string;
};

const z2 = (n: number) => String(n).padStart(2, "0");
const day = (d: Date) => `${d.getFullYear()}-${z2(d.getMonth() + 1)}-${z2(d.getDate())}`;
const clock = (d: Date) => `${z2(d.getHours())}:${z2(d.getMinutes())}`;

/** "2026-10-05 10:00〜11:30", in the server's time zone like every other time it writes. */
export function meetingWhen(startedAt: Date, endedAt: Date | null): string {
  if (!endedAt) return `${day(startedAt)} ${clock(startedAt)}〜`;
  const sameDay = day(startedAt) === day(endedAt);
  return `${day(startedAt)} ${clock(startedAt)}〜${sameDay ? "" : `${day(endedAt)} `}${clock(endedAt)}`;
}

export async function gatherMinutesContext(meetingId: string): Promise<MinutesContext | null> {
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    select: {
      id: true,
      title: true,
      description: true,
      startedAt: true,
      endedAt: true,
      seriesId: true,
      series: { select: { description: true, sttGlossary: true } },
      participants: { orderBy: { position: "asc" }, select: { name: true } },
    },
  });
  if (!meeting) return null;
  const settings = await readSettings();
  // Without Series, a meeting's series is not context: no background, no glossary of its own, and
  // no "last time".
  const series = (await extensionEnabled("series")) ? meeting.series : null;

  // The previous meeting of the same series that has minutes, for "continuing from last time".
  let previous: MinutesContext["previous"] = null;
  if (series && meeting.seriesId) {
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
      previous = { title: prev.title, date: day(prev.startedAt), text: prev.summaries[0].summaryText };
    }
  }

  return {
    meeting: { title: meeting.title, when: meetingWhen(meeting.startedAt, meeting.endedAt) },
    participants: meeting.participants.map((p) => p.name),
    purpose: meeting.description?.trim() ?? "",
    glossary: joinGlossary([settings.sttGlossary, series?.sttGlossary]),
    series: series?.description?.trim() ?? "",
    previous,
    background: settings.llmBackground?.trim() ?? "",
  };
}

const PREVIEW_CHARS = 120;
const cut = (s: string) => (s.length > PREVIEW_CHARS ? `${s.slice(0, PREVIEW_CHARS)}…` : s);

/** One line per piece, for the panel. Null where there is nothing to give. */
export function contextPreviews(ctx: MinutesContext): Record<ContextKey, string | null> {
  return {
    meeting: `${ctx.meeting.title}（${ctx.meeting.when}）`,
    participants: ctx.participants.length ? ctx.participants.join("、") : null,
    purpose: ctx.purpose ? cut(ctx.purpose) : null,
    glossary: ctx.glossary ? cut(ctx.glossary) : null,
    series: ctx.series ? cut(ctx.series) : null,
    previous: ctx.previous ? `${ctx.previous.date}「${ctx.previous.title}」` : null,
    background: ctx.background ? cut(ctx.background) : null,
  };
}
