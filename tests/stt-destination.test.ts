import { describe, expect, it } from "vitest";
import { sttDestination } from "../lib/stt/destination";

describe("sttDestination", () => {
  it("says nothing when recognition stays on this machine", () => {
    expect(sttDestination({ sttProvider: "local" })).toBeNull();
    expect(
      sttDestination({ sttProvider: "local", sttRemoteBaseUrl: "https://api.groq.com/openai/v1" }),
    ).toBeNull();
  });

  it("names the host once remote is selected", () => {
    expect(
      sttDestination({ sttProvider: "remote", sttRemoteBaseUrl: "https://api.groq.com/openai/v1" }),
    ).toBe("api.groq.com");
  });

  it("stays quiet for a whisper server of your own", () => {
    for (const url of [
      "http://127.0.0.1:8080/v1",
      "http://192.168.1.40:8080/v1",
      "http://whisper:8080/v1",
      "http://nuc.local:8080/v1",
    ]) {
      expect(sttDestination({ sttProvider: "remote", sttRemoteBaseUrl: url }), url).toBeNull();
    }
  });

  it("prefers what is about to be saved over what is running", () => {
    // Switching back to local should stop warning immediately, before the service restarts.
    expect(sttDestination({ sttProvider: "local" })).toBeNull();
  });
});
