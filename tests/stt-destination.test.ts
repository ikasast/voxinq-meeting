import { describe, expect, it } from "vitest";
import { profileDestination, sttDestination } from "../lib/stt/destination";

const groq = { id: "g", name: "Groq", baseUrl: "https://api.groq.com/openai/v1" };
const mine = { id: "m", name: "Study box", baseUrl: "http://192.168.1.40:8080/v1" };

describe("profileDestination", () => {
  it("names the host when the audio leaves your network", () => {
    expect(profileDestination(groq)).toBe("api.groq.com");
  });

  it("stays quiet for a server of your own", () => {
    for (const url of [
      "http://127.0.0.1:8080/v1",
      "http://192.168.1.40:8080/v1",
      "http://whisper:8080/v1",
      "http://nuc.local:8080/v1",
    ]) {
      expect(profileDestination({ id: "x", name: "x", baseUrl: url }), url).toBeNull();
    }
  });

  it("says nothing about a profile that is not there", () => {
    expect(profileDestination(undefined)).toBeNull();
    expect(profileDestination(null)).toBeNull();
  });
});

describe("sttDestination", () => {
  it("is silent when recognition stays on this machine", () => {
    expect(sttDestination({ sttDefaultProfileId: "", sttProfiles: [groq] })).toBeNull();
  });

  it("follows the default profile", () => {
    expect(sttDestination({ sttDefaultProfileId: "g", sttProfiles: [groq, mine] })).toBe(
      "api.groq.com",
    );
  });

  it("is silent when the default is a server of your own", () => {
    expect(sttDestination({ sttDefaultProfileId: "m", sttProfiles: [groq, mine] })).toBeNull();
  });

  it("does not warn about a default that no longer exists", () => {
    expect(sttDestination({ sttDefaultProfileId: "gone", sttProfiles: [groq] })).toBeNull();
  });
});
