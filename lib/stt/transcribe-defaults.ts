// What to recognise a recording with, when the caller did not say.
//
// The recording screen and the transcript list always say: they know which model the person
// picked, and they compose the glossary from the settings and the meeting's series as they go.
// The Android app cannot — it hands over a shared audio file and nothing else — so the same
// answer is worked out here, on the server, from the same two places.

import { effectiveSttLanguage } from "@/lib/stt/models";

/** What a caller asked for. Anything absent is filled in from the settings. */
export type TranscribeRequest = {
  profileId?: string;
  model?: string;
  language?: string;
  initialPrompt?: string;
  translate?: boolean;
};

/** The settings, plus the one thing that belongs to this meeting rather than the host. */
export type TranscribeContext = {
  model: string;
  language: string;
  glossary: string;
  translate: boolean;
  seriesGlossary?: string | null;
};

/**
 * The glossary Whisper is primed with: the host's terms and the series' own, in that order.
 *
 * Joined the way the pages join them, so a meeting recognised from the phone is primed with
 * exactly what the same meeting recognised from a browser would have been.
 */
export function joinGlossary(parts: (string | null | undefined)[]): string {
  return parts
    .map((p) => (p ?? "").trim())
    .filter((p) => p.length > 0)
    .join("、");
}

/** Fill in whatever the caller left out. An explicit value always wins, `false` included. */
export function withDefaults(asked: TranscribeRequest, ctx: TranscribeContext): TranscribeRequest {
  const model = asked.model ?? ctx.model ?? undefined;
  const glossary = joinGlossary([ctx.glossary, ctx.seriesGlossary]);
  return {
    profileId: asked.profileId,
    model,
    // A model that only speaks one language has its language pinned for it, which is what the
    // pages do before asking. "auto" is a real answer, not a missing one.
    language: asked.language ?? effectiveSttLanguage(model, ctx.language),
    initialPrompt: asked.initialPrompt ?? (glossary || undefined),
    translate: asked.translate ?? ctx.translate === true,
  };
}
