import { readFileSync, readdirSync } from "node:fs";
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
    expect(proxy).toContain('pathname === "/setup"');
    // And the reset link, which is the credential of somebody who cannot sign in.
    expect(proxy).toContain('pathname.startsWith("/reset/")');
  });

  it("serves every logo the login page asks for", () => {
    // Only `logo.svg` was exempt, and there are four — full and mark, each light and dark. The
    // other three were redirected to /login, so the img on the login page rendered as a broken
    // image. Nothing is gated inside the tailnet, so it showed only from outside: the one place
    // where somebody is seeing this app for the first time.
    const matcher = /"\/\(\(\?!(.*?)\)\.\*\)"/.exec(proxy)?.[1] ?? "";
    const exempt = new RegExp(`^(?:${matcher})`);
    for (const f of readdirSync(join(root, "public"))) {
      if (!f.endsWith(".svg")) continue;
      expect(exempt.test(f), `${f} is gated behind the login page`).toBe(true);
    }
  });
});

describe("identity from the tailnet", () => {
  it("makes the first account an administrator however it was created", () => {
    // Browsing from a phone before visiting /setup would otherwise create a non-admin, and
    // /setup then refuses because accounts exist: a server with no administrator and no way to
    // make one.
    expect(session).toContain("const first = (await prisma.user.count()) === 0;");
    expect(session).toContain("isAdmin: first,");
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
    // "No such account" turns the login form into a way to ask who is on this server — and now
    // that the identifier is an address, into a way to ask whether a particular person is.
    expect(login).toContain('{ error: "Wrong email or password" }');
    expect(login).not.toMatch(/error: "No such (user|account)"|error: "Unknown (username|email)"/);
  });

  it("identifies somebody by the address they already know", () => {
    // Not by the username, which the server picked for them: a tailnet identity becomes `sam`,
    // or `sam2` if `sam` was taken, and nobody should have to remember which.
    expect(login).toContain("where: { email }");
    expect(login).toContain("normaliseEmail(body.email)");
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
