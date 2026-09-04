import { isExternalRequest } from "@/lib/is-tailnet";
import NewMeetingForm from "./new-meeting-form";

// A server shell so the form knows where the request came from. Everything else on this screen
// is client state, but "can this browser reach the transcription service" is not something the
// browser can answer for itself — it is the same judgement the rest of the app makes with
// isExternalRequest, made in the one place that can.
export default async function NewMeetingPage() {
  const external = await isExternalRequest();
  return <NewMeetingForm external={external} />;
}
