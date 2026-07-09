import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { AUTH_COOKIE, expectedAuthToken } from "./lib/auth-token";

// Simple auth. Passes through if APP_PASSWORD is unset (auth disabled).
// When set, protects everything except /login and /api/auth/* with a cookie.
// (In Next.js 16 middleware.ts is deprecated -> migrated to proxy.ts. Same behavior.)
export async function proxy(req: NextRequest) {
  const expected = await expectedAuthToken();
  if (!expected) return NextResponse.next();

  // Requests via Tailscale serve carry the Tailscale-User-Login header that Tailscale
  // has already authenticated -> trust and pass through within the tailnet.
  // (On a public reverse proxy, always strip this header to prevent spoofing.)
  if (req.headers.get("tailscale-user-login")) {
    return NextResponse.next();
  }

  const { pathname } = req.nextUrl;
  if (pathname === "/login" || pathname.startsWith("/api/auth/")) {
    return NextResponse.next();
  }

  const token = req.cookies.get(AUTH_COOKIE)?.value;
  if (token === expected) return NextResponse.next();

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
  matcher: [
    "/((?!_next/static|_next/image|icons/|favicon.ico|apple-icon.png|icon.png|manifest.webmanifest|logo.svg|worklets/).*)",
  ],
};
