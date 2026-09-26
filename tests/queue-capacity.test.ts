import { describe, expect, it } from "vitest";
import { isLocalUrl } from "../lib/queue/capacity";

// Whether an address is "this machine" decides whether work sent there is priced against the
// card. Priced at zero, it neither waits for a recording nor makes one wait for it.

describe("what counts as this machine", () => {
  it("takes the usual names for it", () => {
    for (const url of [
      "http://localhost:11434",
      "http://127.0.0.1:11434",
      "http://[::1]:11434",
      "http://0.0.0.0:11434",
      "http://host.docker.internal:11434",
      "http://gpu.localhost:11434",
      "http://desk.local:11434",
    ]) {
      expect(isLocalUrl(url), url).toBe(true);
    }
  });

  it("takes a Compose service, which is how the bundled Ollama is reached", () => {
    // The default in docker-compose.yml. Read as remote, every set of minutes cost nothing,
    // and a list's worth started at once.
    expect(isLocalUrl("http://ollama:11434")).toBe(true);
    expect(isLocalUrl("http://whisper-server:8080/v1")).toBe(true);
  });

  it("leaves anything with a domain, or another address, as somewhere else", () => {
    for (const url of [
      "https://api.openai.com/v1",
      "https://gpu-box.example.test:11434",
      "http://192.168.1.20:11434",
      "http://[2001:db8::1]:11434",
    ]) {
      expect(isLocalUrl(url), url).toBe(false);
    }
  });

  it("does not throw on something that is not an address", () => {
    expect(isLocalUrl("not a url")).toBe(false);
    expect(isLocalUrl("")).toBe(false);
  });
});
