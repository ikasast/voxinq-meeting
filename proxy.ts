import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { AUTH_COOKIE, expectedAuthToken } from "./lib/auth-token";
import { SESSION_COOKIE, unpackSession } from "./lib/auth/cookie";
import { hasUsersCached } from "./lib/auth/has-users";
import { sessionIsLive } from "./lib/auth/session";
import { allowedFromOutside } from "./lib/external-writes";

// Password auth + a read-only boundary for access from outside the private network.
// Passes everything through when APP_PASSWORD is unset (auth disabled).
// (In Next.js 16 middleware.ts is deprecated -> migrated to proxy.ts. Same behavior.)

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);
// Screens that only make sense next to the microphone. External viewers are sent home rather
// than landing on a page whose every action would be refused.
//
// `/new` is deliberately not among them any more: setting a meeting up — its title, agenda,
// series, participants and time — needs no GPU, no audio and no STT service, and it is the
// part someone does from a work laptop the evening before. The page drops the recording half
// of itself when it is reached from outside; see app/new/new-meeting-form.tsx.
const WRITER_PAGES = [/^\/quick-record$/, /^\/[^/]+\/recording$/];

export async function proxy(req: NextRequest) {
  // Accounts change what this gate is for. Without them it is the shared password it has always
  // been; with them it is "are you signed in", and APP_PASSWORD stops being a way in.
  const accounts = await hasUsersCached();
  const expected = accounts ? null : await expectedAuthToken();
  if (!accounts && !expected) return NextResponse.next(); // auth disabled -> no restrictions

  // Tailscale serve injects an authenticated identity header within the tailnet -> trusted,
  // full access. A public reverse proxy MUST strip this header to prevent spoofing; Tailscale
  // Funnel manages it for you (Funnel requests carry no such header, so they are external).
  if (req.headers.get("tailscale-user-login")) {
    return NextResponse.next();
  }

  const { pathname } = req.nextUrl;

  // "External" = reached without a tailnet identity. Unless NETWORK_MODE=lan trusts the local
  // network, such access is READ-ONLY: it may view pages and download exports, but every
  // state-changing request is refused here — defence in depth behind the password, so even a
  // logged-in viewer on an untrusted machine cannot record, generate, edit or delete.
  const external = process.env.NETWORK_MODE !== "lan";
  if (external) {
    if (
      MUTATING.has(req.method) &&
      pathname.startsWith("/api/") &&
      !pathname.startsWith("/api/auth/") && // login/logout must still work
      !allowedFromOutside(req.method, pathname)
    ) {
      return NextResponse.json(
        { error: "This server is read-only from outside your private network." },
        { status: 403 },
      );
    }
    if (WRITER_PAGES.some((re) => re.test(pathname))) {
      const url = req.nextUrl.clone();
      url.pathname = "/";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  // Login gate for everything else. `/setup` is open for the same reason `/login` is: it is
  // where the first account comes from, and it refuses on its own once one exists.
  if (pathname === "/login" || pathname === "/setup" || pathname.startsWith("/api/auth/")) {
    return NextResponse.next();
  }
  // Signature, expiry, and then the row. The row is the expensive part and it is not optional:
  // a signature proves this server issued the cookie and says nothing about whether the session
  // still exists, so skipping it would make signing a lost device out a button that does
  // nothing. Authorization still belongs where the data is — the Next.js proxy documentation is
  // explicit that a moved route can silently lose proxy coverage — but revocation has to bite
  // here, because until ownership lands there is nothing further in to catch it.
  const sessionId = await unpackSession(req.cookies.get(SESSION_COOKIE)?.value);
  if (sessionId && (await sessionIsLive(sessionId))) return NextResponse.next();
  if (expected && req.cookies.get(AUTH_COOKIE)?.value === expected) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", pathname + req.nextUrl.search);
  return NextResponse.redirect(url);
}

export const config = {
  // Serve static assets/icons/manifest even before auth (needed to render the login page).
  //
  // sw.js is in that list for a harder reason than convenience: a service worker script that
  // answers with a redirect cannot register at all, so gating it does not protect anything —
  // it silently removes the browser's offer to install the app. The file is static, holds no
  // data and caches nothing (see public/sw.js).
  matcher: [
    "/((?!_next/static|_next/image|icons/|favicon.ico|apple-icon.png|icon.png|manifest.webmanifest|sw.js|logo.svg|worklets/).*)",
  ],
};
