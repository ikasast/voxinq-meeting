import { isExternalRequest } from "@/lib/is-tailnet";
import { extensionEnabled } from "@/lib/extensions-store";
import { readSettings } from "@/lib/settings";
import NewMeetingForm from "./new-meeting-form";

// A server shell so the form knows where the request came from. Everything else on this screen
// is client state, but "can this browser reach the transcription service" is not something the
// browser can answer for itself — it is the same judgement the rest of the app makes with
// isExternalRequest, made in the one place that can.
export default async function NewMeetingPage({
  searchParams,
}: {
  // Arrives from the calendar's "+ Add a meeting on this day", as "2026-09-18"; and from a
  // series' "Next meeting", with its name.
  searchParams: Promise<{ date?: string; series?: string }>;
}) {
  const external = await isExternalRequest();
  const { date, series } = await searchParams;
  // Read here rather than in the form: the field shows the name before the meeting exists, so
  // the shape has to be right on the first paint. Fetching it in the browser would show the
  // compact default and then swap it under somebody already typing.
  const { meetingTitleFormat } = await readSettings();
  // A day to book on means nothing while Schedule and reminders is switched off.
  const bookOn = (await extensionEnabled("schedule")) ? date : undefined;
  const inSeries = (await extensionEnabled("series")) ? series?.trim().slice(0, 60) || undefined : undefined;
  return <NewMeetingForm external={external} date={bookOn} series={inSeries} titleFormat={meetingTitleFormat} />;
}
