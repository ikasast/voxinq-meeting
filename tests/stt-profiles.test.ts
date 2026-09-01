import { describe, expect, it } from "vitest";
import { migrateSttSettings, toPublic } from "../lib/settings";
import { nameFromBaseUrl, normalizeProfiles, publicProfile } from "../lib/stt/profiles";

describe("migrating a single saved endpoint", () => {
  // An install with one configured and working must not lose it on upgrade, and losing it
  // would be silent: recognition would start happening locally again with nothing to say why.
  it("becomes one profile named after its host", () => {
    const got = migrateSttSettings({
      sttProvider: "remote",
      sttRemoteBaseUrl: "https://api.groq.com/openai/v1",
      sttRemoteModel: "whisper-large-v3",
      sttRemoteApiKey: "gsk_secret",
    });
    expect(got).not.toBeNull();
    expect(got!.sttProfiles).toHaveLength(1);
    expect(got!.sttProfiles[0]).toMatchObject({
      name: "api.groq.com",
      kind: "openai",
      baseUrl: "https://api.groq.com/openai/v1",
      model: "whisper-large-v3",
      apiKey: "gsk_secret",
    });
    expect(got!.sttDefaultProfileId).toBe(got!.sttProfiles[0].id);
  });

  it("does not turn it on for someone who had left it off", () => {
    // Filling the fields in and leaving the provider on "local" is not using it. Making it the
    // default would start uploading audio nobody asked to upload.
    const got = migrateSttSettings({
      sttProvider: "local",
      sttRemoteBaseUrl: "https://api.groq.com/openai/v1",
    });
    expect(got!.sttProfiles).toHaveLength(1);
    expect(got!.sttDefaultProfileId).toBe("");
  });

  it("does nothing when there was nothing configured", () => {
    expect(migrateSttSettings({})).toBeNull();
    expect(migrateSttSettings({ sttProvider: "local", sttRemoteBaseUrl: "" })).toBeNull();
  });

  it("does not run again once there are profiles", () => {
    const already = migrateSttSettings({
      sttProfiles: [{ id: "a", name: "Kept", kind: "openai", baseUrl: "http://x/v1", model: "m" }],
      sttRemoteBaseUrl: "https://api.groq.com/openai/v1",
    });
    expect(already).toBeNull();
  });
});

describe("normalizeProfiles", () => {
  it("drops entries that could not be used", () => {
    const got = normalizeProfiles([
      null,
      "nonsense",
      { name: "no id" },
      { id: "x", name: "" },
      { id: "ok", name: "Fine", baseUrl: "http://h/v1", model: "m" },
    ]);
    expect(got.map((p) => p.id)).toEqual(["ok"]);
  });

  it("defaults an unknown kind to openai rather than inventing a wire format", () => {
    const [p] = normalizeProfiles([{ id: "x", name: "X", kind: "something-else" }]);
    expect(p.kind).toBe("openai");
    expect(normalizeProfiles([{ id: "g", name: "G", kind: "gemini" }])[0].kind).toBe("gemini");
  });

  it("is not confused by a settings file edited by hand", () => {
    expect(normalizeProfiles(undefined)).toEqual([]);
    expect(normalizeProfiles({})).toEqual([]);
    expect(normalizeProfiles("[]")).toEqual([]);
  });
});

describe("what reaches the browser", () => {
  it("never carries a key", () => {
    const pub = publicProfile({
      id: "a",
      name: "Groq",
      kind: "openai",
      baseUrl: "https://api.groq.com/openai/v1",
      model: "whisper-large-v3",
      apiKey: "gsk_secret",
    });
    expect(JSON.stringify(pub)).not.toContain("gsk_secret");
    expect(pub.hasApiKey).toBe(true);
    expect("apiKey" in pub).toBe(false);
  });
});

describe("nameFromBaseUrl", () => {
  it("uses the host, which is what someone would call it anyway", () => {
    expect(nameFromBaseUrl("https://api.groq.com/openai/v1")).toBe("api.groq.com");
    expect(nameFromBaseUrl("http://192.168.1.9:8080/v1")).toBe("192.168.1.9");
  });

  it("still produces something for a URL it cannot read", () => {
    expect(nameFromBaseUrl("not a url")).toBe("not a url");
    expect(nameFromBaseUrl("")).toBe("Saved endpoint");
  });
});

describe("the settings a browser receives", () => {
  // Found by reading an actual response: the file's old sttRemoteApiKey spread straight through
  // readSettings, and toPublic no longer knew to strip it because profiles had replaced it.
  it("carries no key from the fields profiles replaced", () => {
    const withLegacy = {
      sttProfiles: [],
      sttDefaultProfileId: "",
      sttRemoteApiKey: "gsk_legacy_secret",
      sttRemoteBaseUrl: "https://api.groq.com/openai/v1",
      sttProvider: "remote",
    } as unknown as Parameters<typeof toPublic>[0];
    const json = JSON.stringify(toPublic(withLegacy));
    expect(json).not.toContain("gsk_legacy_secret");
  });
});
