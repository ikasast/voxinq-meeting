import { isExternalRequest } from "@/lib/is-tailnet";
import NewMeetingForm from "./new-meeting-form";

// A server shell so the form knows where the request came from. Everything else on this screen
// is client state, but "can this browser reach the transcription service" is not something the
// browser can answer for itself — it is the same judgement the rest of the app makes with
// isExternalRequest, made in the one place that can.
export default async function NewMeetingPage({
  searchParams,
}: {
  // Arrives from the calendar's "+ Add a meeting on this day", as "2026-09-18".
  searchParams: Promise<{ date?: string }>;
}) {
  const external = await isExternalRequest();
  const { date } = await searchParams;
  return <NewMeetingForm external={external} date={date} />;
}
