import { describe, expect, it } from "vitest";
import {
  KOTOBA_WHISPER,
  WHISPER_MODELS,
  effectiveSttLanguage,
  isJapaneseOnlyModel,
  isKnownWhisperModel,
  modelSizeGuide,
  refusesGlossary,
  whisperModel,
  whisperModelLabel,
} from "../lib/stt/models";

describe("the registry describes each model rather than just naming it", () => {
  it("gives every model a size, so the UI never has to hardcode one", () => {
    for (const m of WHISPER_MODELS) {
      expect(m.sizeGb, m.value).toBeGreaterThan(0);
      expect(m.label, m.value).not.toBe("");
    }
  });

  it("has no duplicate values", () => {
    const values = WHISPER_MODELS.map((m) => m.value);
    expect(new Set(values).size).toBe(values.length);
  });

  it("builds the size guidance from the registry, largest first", () => {
    const guide = modelSizeGuide();
    expect(guide).toContain("large-v3 ≈3GB");
    expect(guide).toContain("small ≈0.5GB");
    // Largest first, so the number that constrains an 8GB card is the first one read.
    expect(guide.indexOf("large-v3 ≈3GB")).toBeLessThan(guide.indexOf("small ≈0.5GB"));
  });

  it("marks the Japanese model's limitations as data, not prose", () => {
    const kotoba = whisperModel(KOTOBA_WHISPER)!;
    expect(kotoba.japaneseOnly).toBe(true);
    expect(kotoba.refusesGlossary).toBe(true);
    expect(kotoba.note).toBeTruthy();
  });
});

describe("model lookup", () => {
  it("recognises what it lists and nothing else", () => {
    expect(isKnownWhisperModel("large-v3-turbo")).toBe(true);
    expect(isKnownWhisperModel("some/custom-model")).toBe(false);
  });

  it("falls back to the raw value as a label for a model typed in by hand", () => {
    expect(whisperModelLabel("some/custom-model")).toBe("some/custom-model");
    expect(whisperModelLabel("large-v3")).toContain("large-v3");
  });

  it("returns nothing for an absent or unknown value", () => {
    expect(whisperModel(undefined)).toBeUndefined();
    expect(whisperModel("nope")).toBeUndefined();
  });
});

describe("Japanese-only handling", () => {
  it("reads the flag for a listed model", () => {
    expect(isJapaneseOnlyModel(KOTOBA_WHISPER)).toBe(true);
    expect(isJapaneseOnlyModel("large-v3-turbo")).toBe(false);
  });

  it("still recognises an unlisted kotoba build by name", () => {
    // Someone pointing at another kotoba conversion should get the same treatment, not have
    // "auto" silently let the model try a language it was never trained for.
    expect(isJapaneseOnlyModel("kotoba-tech/kotoba-whisper-v2.2-ggml")).toBe(true);
    expect(refusesGlossary("kotoba-tech/kotoba-whisper-v2.2-ggml")).toBe(true);
  });

  it("pins auto to Japanese only where it must", () => {
    expect(effectiveSttLanguage(KOTOBA_WHISPER, "auto")).toBe("ja");
    expect(effectiveSttLanguage(KOTOBA_WHISPER, undefined)).toBe("ja");
    // An explicit choice is never overridden, even one the model cannot serve — that is the
    // user's call and it should fail visibly rather than be quietly rewritten.
    expect(effectiveSttLanguage(KOTOBA_WHISPER, "en")).toBe("en");
    expect(effectiveSttLanguage("large-v3-turbo", "auto")).toBe("auto");
  });
});
