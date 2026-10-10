import { describe, expect, it } from "vitest";
import { appVersionFrom, compareVersions } from "../lib/app-version";

describe("the app's version", () => {
  it("is read from its user agent, and nothing else is the app", () => {
    expect(appVersionFrom("Mozilla/5.0 (Linux; Android 17) Chrome/140 VoxinqAndroid/4.0.0-beta.2")).toBe("4.0.0-beta.2");
    expect(appVersionFrom("Mozilla/5.0 VoxinqAndroid/3.9.2")).toBe("3.9.2");
    expect(appVersionFrom("Mozilla/5.0 (iPhone) Safari")).toBeNull();
  });

  it("is ordered as semver, prereleases before their release", () => {
    expect(compareVersions("3.9.2", "4.0.0-beta.1")).toBe(-1);
    expect(compareVersions("4.0.0-beta.2", "4.0.0-beta.10")).toBe(-1);
    expect(compareVersions("4.0.0-beta.3", "4.0.0")).toBe(-1);
    expect(compareVersions("4.0.0", "4.0.0")).toBe(0);
    expect(compareVersions("4.0.1", "4.0.0")).toBe(1);
    expect(compareVersions("4.0.0-rc.1", "4.0.0-beta.9")).toBe(1);
  });
});
