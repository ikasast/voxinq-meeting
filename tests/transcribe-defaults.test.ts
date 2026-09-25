import { describe, expect, it } from "vitest";
import { joinGlossary, withDefaults } from "@/lib/stt/transcribe-defaults";

// The pages know which model was picked and compose the glossary as they go. The Android app,
// handed an audio file from another app, knows none of it — so the server answers for it. What
// matters is that the answer is the *same* one a browser would have given, and that a caller
// who did say something is never overruled.

const settings = {
  model: "large-v3-turbo",
  language: "auto",
  glossary: "Project Kestrel、milestone review",
  translate: false,
};

describe("what to recognise a recording with", () => {
  it("is the settings, when the caller said nothing", () => {
    expect(withDefaults({}, settings)).toEqual({
      profileId: undefined,
      model: "large-v3-turbo",
      language: "auto",
      initialPrompt: "Project Kestrel、milestone review",
      translate: false,
    });
  });

  it("adds the series' own terms after the host's", () => {
    const params = withDefaults({}, { ...settings, seriesGlossary: "rollout plan" });
    expect(params.initialPrompt).toBe("Project Kestrel、milestone review、rollout plan");
  });

  it("sends no prompt at all when there are no terms", () => {
    // Not an empty string: that is a prompt, and Whisper is entitled to make something of it.
    const params = withDefaults({}, { ...settings, glossary: "", seriesGlossary: null });
    expect(params.initialPrompt).toBeUndefined();
  });

  it("pins the language for a model that only speaks one", () => {
    const params = withDefaults({}, { ...settings, model: "kotoba-tech/kotoba-whisper-v2.0-faster" });
    expect(params.language).toBe("ja");
  });

  it("lets the caller win, including when what it says is no", () => {
    const params = withDefaults(
      { model: "medium", language: "en", initialPrompt: "", translate: false },
      { ...settings, translate: true },
    );
    expect(params).toEqual({
      profileId: undefined,
      model: "medium",
      language: "en",
      initialPrompt: "",
      translate: false,
    });
  });

  it("keeps a saved endpoint's id, which only the caller can know", () => {
    expect(withDefaults({ profileId: "p1" }, settings).profileId).toBe("p1");
  });
});

describe("the glossary", () => {
  it("drops what is not there and trims what is", () => {
    expect(joinGlossary([" a ", "", null, undefined, "b"])).toBe("a、b");
    expect(joinGlossary([null, "   "])).toBe("");
  });
});
