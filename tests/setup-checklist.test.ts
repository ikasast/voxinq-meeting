import { describe, expect, it } from "vitest";
import { parseChecklistState, phoneKind } from "@/lib/setup-checklist";
import { effectiveTimeZone, isTimeZone } from "@/lib/time-zone";

describe("which devices count as a phone", () => {
  it("knows the Android app by the mark its WebView adds", () => {
    expect(phoneKind("Mozilla/5.0 (Linux; Android 16; SM-S9) AppleWebKit/537.36 Chrome/142 Mobile Safari/537.36 VoxinqAndroid/4.9.0")).toBe("app");
  });

  it("counts a phone's browser", () => {
    expect(phoneKind("Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome/142 Mobile Safari/537.36")).toBe("browser");
    expect(phoneKind("Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148")).toBe("browser");
  });

  it("does not count the PC", () => {
    // Reaching the service from the machine it runs on says nothing about the phone.
    expect(phoneKind("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/142 Safari/537.36")).toBeNull();
    expect(phoneKind(null)).toBeNull();
  });
});

describe("what the checklist remembers", () => {
  it("stays closed unless the file says plainly that it is open", () => {
    // A file edited into nonsense should not bring the checklist back on a working install.
    expect(parseChecklistState({}).dismissed).toBe(true);
    expect(parseChecklistState({ dismissed: "no" }).dismissed).toBe(true);
    expect(parseChecklistState(null).dismissed).toBe(true);
    expect(parseChecklistState({ dismissed: false }).dismissed).toBe(false);
  });

  it("keeps a phone only when it is well formed", () => {
    const at = "2026-11-15T05:02:00.000Z";
    expect(parseChecklistState({ dismissed: false, phone: { at, via: "app" } }).phone).toEqual({ at, via: "app" });
    expect(parseChecklistState({ dismissed: false, phone: { at, via: "pc" } }).phone).toBeNull();
    expect(parseChecklistState({ dismissed: false, phone: { at: "yesterday", via: "app" } }).phone).toBeNull();
  });
});

describe("the time zone setting", () => {
  it("accepts zone names the runtime knows and nothing else", () => {
    expect(isTimeZone("Asia/Tokyo")).toBe(true);
    expect(isTimeZone("Europe/London")).toBe(true);
    expect(isTimeZone("UTC")).toBe(true);
    expect(isTimeZone("Mars/Olympus_Mons")).toBe(false);
    expect(isTimeZone("")).toBe(false);
    expect(isTimeZone(9)).toBe(false);
  });

  it("puts a saved choice ahead of the environment", () => {
    expect(effectiveTimeZone("Asia/Tokyo")).toBe("Asia/Tokyo");
    // An unknown name falls through rather than being handed to the runtime.
    expect(effectiveTimeZone("Mars/Olympus_Mons")).not.toBe("Mars/Olympus_Mons");
  });
});
