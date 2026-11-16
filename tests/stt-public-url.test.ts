import { afterEach, describe, expect, it } from "vitest";
import { deriveSttWsUrl, sttPortFrom, sttWsUrlForRequest } from "@/lib/stt/public-url";

describe("deriveSttWsUrl", () => {
  it("puts an HTTPS page's service on :8443 of the same name", () => {
    expect(deriveSttWsUrl({ protocol: "https:", hostname: "voxinq.example.ts.net" })).toBe(
      "wss://voxinq.example.ts.net:8443/ws",
    );
  });

  it("puts a plain-HTTP page's service on the STT port of the same host", () => {
    expect(deriveSttWsUrl({ protocol: "http:", hostname: "localhost" })).toBe("ws://localhost:8000/ws");
    expect(deriveSttWsUrl({ protocol: "http:", hostname: "127.0.0.1" }, 8100)).toBe("ws://127.0.0.1:8100/ws");
  });

  it("keeps IPv6 hosts bracketed, whichever way they arrive", () => {
    expect(deriveSttWsUrl({ protocol: "http:", hostname: "[::1]" })).toBe("ws://[::1]:8000/ws");
    expect(deriveSttWsUrl({ protocol: "http:", hostname: "::1" })).toBe("ws://[::1]:8000/ws");
  });
});

describe("sttPortFrom", () => {
  it("falls back to 8000 for anything that is not a port", () => {
    expect(sttPortFrom(undefined)).toBe(8000);
    expect(sttPortFrom("")).toBe(8000);
    expect(sttPortFrom("abc")).toBe(8000);
    expect(sttPortFrom("70000")).toBe(8000);
    expect(sttPortFrom("8100")).toBe(8100);
  });
});

describe("sttWsUrlForRequest", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it("follows the address the client used, behind tailscale serve", () => {
    delete process.env.STT_WS_URL;
    delete process.env.NEXT_PUBLIC_STT_WS_URL;
    const h = new Headers({ host: "voxinq.example.ts.net", "x-forwarded-proto": "https" });
    expect(sttWsUrlForRequest(h)).toBe("wss://voxinq.example.ts.net:8443/ws");
  });

  it("drops the web port from a plain-HTTP Host and uses STT_PORT", () => {
    delete process.env.STT_WS_URL;
    delete process.env.NEXT_PUBLIC_STT_WS_URL;
    process.env.STT_PORT = "8100";
    expect(sttWsUrlForRequest(new Headers({ host: "192.168.1.20:3000" }))).toBe("ws://192.168.1.20:8100/ws");
  });

  it("lets STT_WS_URL win", () => {
    process.env.STT_WS_URL = "wss://elsewhere.example:9443/ws";
    expect(sttWsUrlForRequest(new Headers({ host: "voxinq.example.ts.net", "x-forwarded-proto": "https" }))).toBe(
      "wss://elsewhere.example:9443/ws",
    );
  });

  it("treats an empty STT_WS_URL as unset, as the compose file passes it", () => {
    process.env.STT_WS_URL = "";
    delete process.env.NEXT_PUBLIC_STT_WS_URL;
    expect(sttWsUrlForRequest(new Headers({ host: "localhost:3000" }))).toBe("ws://localhost:8000/ws");
  });
});
