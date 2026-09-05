import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The gate itself. These are file-content checks: the proxy is not something this suite can
// run, and each of these is a property whose absence would be silent and serious.

const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");
const proxy = read("proxy.ts");
const session = read("lib/auth/session.ts");

describe("the proxy", () => {
  it("checks the session row, not only the signature", () => {
    // A signature says this server issued the cookie. Only the row says the session still
    // exists — without this read, "sign out every device" returns ok and changes nothing for a
    // month. Verified in a browser too: a revoked cookie went from 200 to 307/401.
    expect(proxy).toContain("await sessionIsLive(sessionId)");
    expect(session).toContain("export async function sessionIsLive");
  });

  it("stops accepting the shared password once accounts exist", () => {
    // Otherwise creating accounts would add a way in rather than replacing one, and APP_PASSWORD
    // would stay a skeleton key past the point where anybody remembered it was set.
    expect(proxy).toContain("const expected = accounts ? null : await expectedAuthToken();");
  });

  it("keeps working with no accounts at all", () => {
    // The upgrade path. An install that has never signed anybody up must behave exactly as it
    // did before this release, or the release locks people out of their own server.
    expect(proxy).toContain("if (!accounts && !expected) return NextResponse.next();");
  });

  it("leaves /setup reachable, since it is where the first account comes from", () => {
    expect(proxy).toMatch(/pathname === "\/login" \|\| pathname === "\/setup"/);
  });
});

describe("identity from the tailnet", () => {
  it("makes the first account an administrator however it was created", () => {
    // Browsing from a phone before visiting /setup would otherwise create a non-admin, and
    // /setup then refuses because accounts exist: a server with no administrator and no way to
    // make one.
    expect(session).toContain("isAdmin: (await prisma.user.count()) === 0");
  });

  it("survives two tabs arriving at once", () => {
    expect(session).toMatch(/catch \{[\s\S]*?findUnique\(\{\s*where: \{ tailscaleLogin: login \}/);
  });

  it("refuses a disabled account through either door", () => {
    expect(session).toContain("!session.user.disabledAt");
    expect(session).toContain("if (user && !user.disabledAt)");
  });
});

describe("signing in", () => {
  const login = read("app/api/auth/login/route.ts");
  const setup = read("app/api/auth/setup/route.ts");
  const password = read("app/api/auth/password/route.ts");

  it("does not say which half was wrong", () => {
    // "No such user" turns the login form into a way to ask who has an account here.
    expect(login).toContain('{ error: "Wrong username or password" }');
    expect(login).not.toMatch(/error: "No such user"|error: "Unknown username"/);
  });

  it("closes setup for good once an account exists", () => {
    expect(setup).toContain("if (await hasUsersCached())");
    expect(setup).toContain("status: 409");
  });

  it("requires the current password to change one that exists", () => {
    // A borrowed unlocked browser should cost a session, not the account.
    expect(password).toContain("if (existing.passwordHash) {");
    expect(password).toContain("status: 403");
  });

  it("lets an account with no password set its first one", () => {
    // Accounts made from a tailnet identity have none, and need one to be reachable from
    // anywhere else.
    expect(password).toContain("Setting a first");
  });
});

describe("the switch from a shared password to accounts", () => {
  const hasUsers = read("lib/auth/has-users.ts");

  it("re-checks while the answer is still no", () => {
    // The proxy is bundled separately from the routes and keeps its own copy of this module,
    // so nothing a route does can clear the proxy's cache. The recheck is what closes the
    // window instead, and it only has to close it once.
    expect(hasUsers).toContain("RECHECK_MS");
    expect(hasUsers).toContain("if (cached === true) return true;");
  });

  it("does not fail open when the database is unreachable", () => {
    // "Cannot check" is not "no accounts, let everybody in".
    expect(hasUsers).toContain("return cached ?? false;");
  });
});
