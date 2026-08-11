// The Whisper models offered in the UI (settings, per-meeting override, re-transcription).
//
// Values are passed straight to faster-whisper, which accepts either a bundled size name
// ("large-v3-turbo", …) or a Hugging Face repo id of a CTranslate2-converted model. A repo
// id is downloaded on first use (~1.5GB for kotoba-whisper) and cached afterwards.

export type WhisperModelOption = { value: string; label: string };

// kotoba-whisper is distilled from Whisper on Japanese speech: notably faster and lighter
// than large-v3 with better Japanese accuracy — but Japanese-only, its output tends to come
// back with little punctuation, and its 2-layer decoder cannot take an initial_prompt (with
// one set it returns nothing at all), so the glossary is skipped for it.
export const KOTOBA_WHISPER = "kotoba-tech/kotoba-whisper-v2.0-faster";

export const WHISPER_MODELS: WhisperModelOption[] = [
  { value: "large-v3-turbo", label: "large-v3-turbo (default; fast and accurate)" },
  { value: "large-v3", label: "large-v3 (accurate)" },
  { value: "medium", label: "medium" },
  { value: "distil-large-v3", label: "distil-large-v3" },
  { value: "small", label: "small (light)" },
  {
    value: KOTOBA_WHISPER,
    label: "kotoba-whisper-v2.0 (Japanese only, fast; sparse punctuation, no glossary)",
  },
];

export function whisperModelLabel(value: string): string {
  return WHISPER_MODELS.find((m) => m.value === value)?.label ?? value;
}

export function isKnownWhisperModel(value: string): boolean {
  return WHISPER_MODELS.some((m) => m.value === value);
}

// Japanese-only models can't honour "auto" — language detection would let Whisper try to
// transcribe as another language on a model that was never trained for it.
export function isJapaneseOnlyModel(model?: string): boolean {
  return Boolean(model && /kotoba/i.test(model));
}

// The language to send with a transcription request: "auto" (or unset) is pinned to
// Japanese for a Japanese-only model, and left alone otherwise.
export function effectiveSttLanguage(model?: string, language?: string): string | undefined {
  if (isJapaneseOnlyModel(model) && (!language || language === "auto")) return "ja";
  return language;
}
