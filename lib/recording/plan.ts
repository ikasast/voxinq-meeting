// How to record a meeting, decided without a page to ask anybody.
//
// The recording page works this out as it goes: the model this meeting was set up with, its
// language, the glossary from the settings and the series, the microphone mode, and — when
// something else is using the GPU — a question put to the person holding the phone. A recording
// started from a notice (on the phone's lock screen, or a watch) has none of that page and nobody
// to put the question to, so the same answers are worked out here, from the same places.
//
// The one answer that cannot be the same is the question. Taking the card from running work is
// something a person should choose; leaving it alone loses nothing, because the audio is kept
// and transcribed after the meeting. So a recording started without a page records only, and
// the card is reserved for it only when nothing else wanted it.

import { effectiveSttLanguage } from "@/lib/stt/models";
import { joinGlossary } from "@/lib/stt/transcribe-defaults";

export type RecordingPlanInput = {
  meeting: { title: string; whisperModel: string | null; sttLanguage: string | null };
  settings: {
    whisperModel: string;
    sttLanguage: string;
    sttGlossary: string;
    micMode: string;
    sttTranslate: boolean;
  };
  seriesGlossary: string | null | undefined;
  wsUrl: string;
  /** The transcription service says this host cannot keep up with speech. */
  deferredHost: boolean;
  /** Something else is using the card right now. */
  contended: boolean;
};

export type RecordingPlan = {
  wsUrl: string;
  title: string;
  model: string;
  language?: string;
  initialPrompt?: string;
  translate: boolean;
  micMode: string;
  /**
   * `false` records without live recognition; absent means "whatever the host can do", which is
   * not the same thing (see lib/stt/client.ts).
   */
  liveTranscript?: false;
  /** Recording only because something else holds the card, not because of the hardware. */
  recordOnly: boolean;
  /** Whether the card should be reserved for this recording. */
  reserve: boolean;
};

export function recordingPlan(input: RecordingPlanInput): RecordingPlan {
  const model = input.meeting.whisperModel || input.settings.whisperModel;
  const language = effectiveSttLanguage(model, input.meeting.sttLanguage ?? input.settings.sttLanguage);
  const glossary = joinGlossary([input.settings.sttGlossary, input.seriesGlossary]);
  const base = {
    wsUrl: input.wsUrl,
    title: input.meeting.title,
    model,
    ...(language ? { language } : {}),
    ...(glossary ? { initialPrompt: glossary } : {}),
    translate: input.settings.sttTranslate,
    micMode: input.settings.micMode,
  };
  // A host that transcribes at the end loads no model during the meeting, so there is no card to
  // take and nothing to ask about.
  if (input.deferredHost) return { ...base, liveTranscript: false, recordOnly: false, reserve: false };
  if (input.contended) return { ...base, liveTranscript: false, recordOnly: true, reserve: false };
  return { ...base, recordOnly: false, reserve: true };
}
