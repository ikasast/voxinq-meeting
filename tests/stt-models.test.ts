import { describe, expect, it } from "vitest";
import { KOTOBA_WHISPER, effectiveSttLanguage, isKnownWhisperModel } from "../lib/stt/models";

describe("effectiveSttLanguage", () => {
  it("pins auto-detect to Japanese for a Japanese-only model", () => {
    expect(effectiveSttLanguage(KOTOBA_WHISPER, "auto")).toBe("ja");
    expect(effectiveSttLanguage(KOTOBA_WHISPER, undefined)).toBe("ja");
  });

  it("keeps an explicitly chosen language", () => {
    expect(effectiveSttLanguage(KOTOBA_WHISPER, "en")).toBe("en");
  });

  it("leaves auto-detect alone for multilingual models", () => {
    expect(effectiveSttLanguage("large-v3-turbo", "auto")).toBe("auto");
    expect(effectiveSttLanguage(undefined, undefined)).toBeUndefined();
  });
});

describe("isKnownWhisperModel", () => {
  it("recognizes the offered models and rejects others", () => {
    expect(isKnownWhisperModel("large-v3-turbo")).toBe(true);
    expect(isKnownWhisperModel(KOTOBA_WHISPER)).toBe(true);
    expect(isKnownWhisperModel("tiny")).toBe(false);
  });
});
