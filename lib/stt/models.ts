// The Whisper models offered in the UI (settings, per-meeting override, re-transcription).
//
// This used to be a list of strings passed straight to faster-whisper. It is a list of
// descriptors now because a model is no longer just a name: the two backends want different
// formats of the same weights (CTranslate2 repositories vs ggml files), and the size of a
// model depends on which one you get. Keeping that in the registry means the UI can describe
// what a model will actually cost instead of carrying a paragraph of hardcoded numbers that
// only ever applied to one backend on one card.

export type WhisperModel = {
  /** What the user picks, and what is stored in settings and on a meeting. */
  value: string;
  label: string;
  /** Approximate resident size in GB, for the guidance shown under the picker. */
  sizeGb: number;
  /** Trained on Japanese only — "auto" has to be pinned rather than detected. */
  japaneseOnly?: boolean;
  /** Its decoder cannot take an initial_prompt, so the glossary is skipped for it. */
  refusesGlossary?: boolean;
  /** Short reason to show beside the model, when there is something to warn about. */
  note?: string;
};

// kotoba-whisper is distilled from Whisper on Japanese speech: notably faster and lighter
// than large-v3 with better Japanese accuracy — but Japanese-only, its output tends to come
// back with little punctuation, and its 2-layer decoder cannot take an initial_prompt (with
// one set it returns nothing at all), so the glossary is skipped for it.
export const KOTOBA_WHISPER = "kotoba-tech/kotoba-whisper-v2.0-faster";

export const WHISPER_MODELS: WhisperModel[] = [
  {
    value: "large-v3-turbo",
    label: "large-v3-turbo (default; fast and accurate)",
    sizeGb: 1.7,
  },
  { value: "large-v3", label: "large-v3 (accurate)", sizeGb: 3 },
  { value: "medium", label: "medium", sizeGb: 1.5 },
  { value: "distil-large-v3", label: "distil-large-v3", sizeGb: 1.5 },
  { value: "small", label: "small (light)", sizeGb: 0.5 },
  {
    value: KOTOBA_WHISPER,
    label: "kotoba-whisper-v2.0 (Japanese only, fast; sparse punctuation, no glossary)",
    sizeGb: 1.5,
    japaneseOnly: true,
    refusesGlossary: true,
    note: "Distilled on Japanese speech — faster and more accurate for Japanese, but the transcription language is forced to Japanese, it adds little punctuation, and the glossary is skipped for it.",
  },
];

export function whisperModel(value?: string): WhisperModel | undefined {
  return value ? WHISPER_MODELS.find((m) => m.value === value) : undefined;
}

export function whisperModelLabel(value: string): string {
  return whisperModel(value)?.label ?? value;
}

export function isKnownWhisperModel(value: string): boolean {
  return Boolean(whisperModel(value));
}

// Japanese-only models can't honour "auto" — language detection would let Whisper try to
// transcribe as another language on a model that was never trained for it.
//
// Falls back to matching the name for a model typed in by hand: someone pointing at another
// kotoba build should get the same treatment as the one in the list.
export function isJapaneseOnlyModel(model?: string): boolean {
  const known = whisperModel(model);
  if (known) return Boolean(known.japaneseOnly);
  return Boolean(model && /kotoba/i.test(model));
}

/** Whether to withhold the glossary — the same fallback reasoning as above. */
export function refusesGlossary(model?: string): boolean {
  const known = whisperModel(model);
  if (known) return Boolean(known.refusesGlossary);
  return Boolean(model && /kotoba/i.test(model));
}

// The language to send with a transcription request: "auto" (or unset) is pinned to
// Japanese for a Japanese-only model, and left alone otherwise.
export function effectiveSttLanguage(model?: string, language?: string): string | undefined {
  if (isJapaneseOnlyModel(model) && (!language || language === "auto")) return "ja";
  return language;
}

/** One line of "what will this cost me", built from the registry rather than written out. */
export function modelSizeGuide(): string {
  const bySize = [...WHISPER_MODELS].sort((a, b) => b.sizeGb - a.sizeGb);
  return bySize.map((m) => `${m.value} ≈${m.sizeGb}GB`).join(" / ");
}
