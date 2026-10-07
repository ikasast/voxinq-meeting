// What to recognise a recording with, when the caller did not say.
//
// The recording screen and the transcript list always say: they know which model the person
// picked, and they compose the glossary from the settings and the meeting's series as they go.
// The Android app cannot — it hands over a shared audio file and nothing else — so the same
// answer is worked out here, on the server, from the same two places.

import { normalizeInclude } from "@/lib/minutes-context";
import type { MinutesParams } from "@/lib/queue/types";
import { effectiveSttLanguage } from "@/lib/stt/models";

/** What a caller asked for. Anything absent is filled in from the settings. */
export type TranscribeRequest = {
  profileId?: string;
  model?: string;
  language?: string;
  initialPrompt?: string;
  translate?: boolean;
  /** Carried through untouched: it is for the queue, not for the recogniser. */
  thenMinutes?: boolean;
  /** Likewise: how the chained minutes are to be written. */
  minutesParams?: MinutesParams;
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
    // Not a recognition setting, so there is nothing to fill in for it.
    ...(asked.thenMinutes ? { thenMinutes: true } : {}),
    ...(asked.thenMinutes && asked.minutesParams ? { minutesParams: asked.minutesParams } : {}),
  };
}

/** The chained minutes' choices: the two a run can be given, as short strings, and the context. */
export function minutesParamsFrom(raw: unknown): MinutesParams | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const pick = (k: string) => (typeof r[k] === "string" && (r[k] as string).length <= 100 ? (r[k] as string) : undefined);
  const include = normalizeInclude(r.include);
  const out: MinutesParams = {
    provider: pick("provider"),
    templateId: pick("templateId"),
    ...(include ? { include } : {}),
  };
  return Object.values(out).some((v) => v !== undefined) ? out : undefined;
}
