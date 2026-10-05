import { describe, expect, it } from "vitest";
import {
  MIC_SPEAKER,
  freshVoice,
  fromDiarizer,
  isSpeakerKey,
  nameOf,
  namesFromRequest,
  plainName,
  readNames,
  speakersInOrder,
  toneOf,
  voiceKey,
  voiceNumber,
} from "@/lib/speakers";

// The spelling of a speaker key is stored on every transcript row, so it must not move: "self"
// for the microphone, "partner-<n>" for the n-th separated voice.

describe("speaker keys", () => {
  it("are the microphone or a numbered voice", () => {
    expect(MIC_SPEAKER).toBe("self");
    expect(voiceKey(3)).toBe("partner-3");
    expect(voiceNumber("partner-12")).toBe(12);
    expect(voiceNumber("self")).toBeNull();
    expect(voiceNumber("partner-")).toBeNull();
    expect(voiceNumber("partner-x")).toBeNull();
    expect(isSpeakerKey("self")).toBe(true);
    expect(isSpeakerKey("partner-0")).toBe(true);
    expect(isSpeakerKey("speaker0")).toBe(false);
    expect(isSpeakerKey("")).toBe(false);
  });

  it("come from the diarizer's numbering", () => {
    expect(fromDiarizer("speaker2")).toBe("partner-2");
    // Anything it did not number is the first voice, unless the caller says otherwise.
    expect(fromDiarizer("spk")).toBe("partner-0");
    expect(fromDiarizer(undefined)).toBe("partner-0");
    expect(fromDiarizer("spk", MIC_SPEAKER)).toBe("self");
    expect(fromDiarizer("speaker1", MIC_SPEAKER)).toBe("partner-1");
  });
});

describe("speaker names", () => {
  it("fall back to a plain name counted from 1", () => {
    expect(plainName("self")).toBe("Me");
    expect(plainName("partner-0")).toBe("Speaker 1");
    expect(plainName("odd")).toBe("odd");
    expect(nameOf("partner-1", { "partner-1": "  Sato " })).toBe("Sato");
    expect(nameOf("partner-1", { "partner-1": "   " })).toBe("Speaker 2");
    expect(nameOf("self")).toBe("Me");
  });

  it("read back whatever was stored, and nothing from what cannot be read", () => {
    expect(readNames('{"partner-0":"Kato","partner-1":3}')).toEqual({ "partner-0": "Kato" });
    expect(readNames("not json")).toEqual({});
    expect(readNames("[1,2]")).toEqual({});
    expect(readNames("null")).toEqual({});
    expect(readNames(null)).toEqual({});
  });

  it("are stored only for real keys, trimmed and not empty", () => {
    expect(namesFromRequest({ "partner-0": " Kato ", self: "", odd: "x", "partner-2": 5 })).toEqual({
      "partner-0": "Kato",
    });
    expect(namesFromRequest(null)).toBeNull();
    expect(namesFromRequest(["Kato"])).toBeNull();
    expect(namesFromRequest("Kato")).toBeNull();
  });
});

describe("speaker lists", () => {
  it("put the microphone first and the voices in number order", () => {
    expect(speakersInOrder(["partner-2", "partner-0", "odd", "partner-2"])).toEqual([
      "self",
      "partner-0",
      "partner-2",
    ]);
    // A voice with a name but no line yet is still offered.
    expect(speakersInOrder([], { "partner-4": "Ito" })).toEqual(["self", "partner-4"]);
  });

  it("hand out a voice nobody has", () => {
    expect(freshVoice(["self"])).toBe("partner-0");
    expect(freshVoice(["partner-0", "partner-3", "self"])).toBe("partner-4");
  });

  it("give each voice a colour, round the ring", () => {
    expect(toneOf("self")).not.toEqual(toneOf("partner-0"));
    expect(toneOf("partner-0")).toEqual(toneOf("partner-6"));
    expect(toneOf("partner-0")).not.toEqual(toneOf("partner-1"));
    expect(toneOf("odd").chip).toContain("stone");
  });
});
