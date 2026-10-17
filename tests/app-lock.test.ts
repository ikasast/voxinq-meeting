import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The Android app's lock (android/.../AppLock.kt) and the server's side of it: one yes-or-no
// rule an administrator sets, which the app reads before it has a session. Read as source, in the
// shape tests/settings-fields.test.ts uses, because what can go wrong is a line in the wrong file.

const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

describe("requiring the app lock", () => {
  it("is the machine's, so only an administrator sets it", () => {
    const scope = read("lib/settings-scope.ts");
    const machine = scope.slice(scope.indexOf("export const MACHINE_KEYS = ["), scope.indexOf("] as const"));
    expect(machine).toContain('"requireAppLock"');
    const route = read("app/api/app-lock/route.ts");
    expect(route).toContain("me && !me.isAdmin");
    expect(route).toMatch(/apiError\("Only an administrator can require the app lock\.", 403\)/);
  });

  it("reaches an app that is not signed in, for reading only", () => {
    // The app asks natively, without the page's cookie. Only the GET: changing it stays behind
    // the login like everything else.
    const proxy = read("proxy.ts");
    expect(proxy).toContain('(pathname === "/api/app-lock" && req.method === "GET")');
  });

  it("is what the app asks for", () => {
    const activity = read("android/app/src/main/java/io/github/ikasast/voxinq/MainActivity.kt");
    expect(activity).toContain('"$origin/api/app-lock"');
    expect(activity).toContain('optBoolean("required", false)');
    const route = read("app/api/app-lock/route.ts");
    expect(route).toContain("required: s.requireAppLock");
  });

  it("speaks the same messages on both sides of the bridge", () => {
    const activity = read("android/app/src/main/java/io/github/ikasast/voxinq/MainActivity.kt");
    const native = read("lib/stt/native.ts");
    for (const type of ["lock", "lockSet"]) {
      expect(activity).toContain(`"${type}" ->`);
      expect(native).toContain(`type: "${type}"`);
    }
    const lock = read("android/app/src/main/java/io/github/ikasast/voxinq/AppLock.kt");
    for (const field of ["supported", "enabled", "chosen", "required", "afterMinutes", "secure"]) {
      expect(lock).toContain(`"${field}" to`);
      expect(native).toContain(`m.${field}`);
    }
  });
});
