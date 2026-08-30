import { describe, expect, it } from "vitest";
import { externalHostOf, llmDestination } from "../lib/llm/destination";

describe("externalHostOf", () => {
  it("treats this machine as local, however it is written", () => {
    for (const u of [
      "http://localhost:11434",
      "http://127.0.0.1:11434",
      "http://127.1.2.3:8000/v1",
      "http://0.0.0.0:1234/v1",
      "http://[::1]:11434",
      "http://host.docker.internal:11434",
      "http://ollama:11434",
    ]) {
      expect(externalHostOf(u), u).toBeNull();
    }
  });

  it("treats the local network as local", () => {
    for (const u of ["http://192.168.1.50:1234/v1", "http://10.0.0.8:11434", "http://172.16.4.2:8080", "http://nuc.local:1234"]) {
      expect(externalHostOf(u), u).toBeNull();
    }
  });

  it("names the host when it is somewhere else", () => {
    expect(externalHostOf("https://api.openai.com/v1")).toBe("api.openai.com");
    expect(externalHostOf("https://generativelanguage.googleapis.com/v1beta")).toBe(
      "generativelanguage.googleapis.com",
    );
    expect(externalHostOf("api.example.com/v1")).toBe("api.example.com");
  });

  it("does not mistake a public host for a private one by prefix", () => {
    // 172.15 and 172.32 are outside the private range; 10.x is inside it but "10x.com" is not.
    expect(externalHostOf("http://172.15.0.1/v1")).toBe("172.15.0.1");
    expect(externalHostOf("http://172.32.0.1/v1")).toBe("172.32.0.1");
    expect(externalHostOf("http://100.20.30.40/v1")).toBe("100.20.30.40");
  });

  it("errs towards warning when the URL cannot be read", () => {
    expect(externalHostOf("http://")).toBe("http://");
  });

  it("says nothing when nothing is configured", () => {
    expect(externalHostOf("")).toBeNull();
    expect(externalHostOf("   ")).toBeNull();
  });
});

describe("llmDestination", () => {
  it("is always external for Anthropic, which has no base URL to change", () => {
    expect(llmDestination({ llmProvider: "anthropic" })).toEqual({
      external: true,
      host: "api.anthropic.com",
    });
  });

  it("follows the base URL rather than the provider name", () => {
    // The trap: "OpenAI-compatible" pointed at LM Studio on this machine.
    expect(
      llmDestination({ llmProvider: "openai", openaiBaseUrl: "http://127.0.0.1:1234/v1" }),
    ).toEqual({ external: false });
    // And its mirror: Ollama pointed at someone else's server.
    expect(
      llmDestination({ llmProvider: "ollama", ollamaBaseUrl: "https://ollama.example.com" }),
    ).toEqual({ external: true, host: "ollama.example.com" });
  });

  it("reads the base URL belonging to the selected provider", () => {
    // openaiBaseUrl is external but ollama is selected, so it must not be consulted.
    expect(
      llmDestination({
        llmProvider: "ollama",
        ollamaBaseUrl: "http://ollama:11434",
        openaiBaseUrl: "https://api.openai.com/v1",
      }),
    ).toEqual({ external: false });
  });
});
