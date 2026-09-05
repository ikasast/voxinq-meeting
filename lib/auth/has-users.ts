import { prisma } from "@/lib/prisma";

// Does this instance have accounts yet?
//
// The answer decides which app you are running: with no accounts it is the one it has always
// been — one shared password, or none, and the tailnet trusted wholesale. With accounts it
// asks who you are. Existing installs upgrade into the first state and stay there until
// somebody signs up, which is what stops this release locking anyone out of their own server.
//
// Cached because the proxy asks on every request. Once true it can never go back to false in
// any way that matters — deleting the last account is not a supported way to disable auth, and
// a stale `true` only means the login page is shown to somebody who has an account anyway.
//
// The stale `false` is the one worth stating. **The proxy is bundled separately from the route
// handlers, so it has its own copy of this module and its own cache** — clearing it from the
// setup route cannot reach the proxy's. For up to RECHECK_MS after the first account is
// created, the proxy still accepts the shared password. What that window costs: somebody who
// already knows APP_PASSWORD, and therefore already had every page in the app a second
// earlier, keeps it for a few seconds longer. It was measured rather than assumed — a shared
// cookie went from 200 to 307 across the boundary.

let cached: boolean | null = null;
let checkedAt = 0;
const RECHECK_MS = 10_000;

export async function hasUsersCached(): Promise<boolean> {
  if (cached === true) return true;
  if (cached !== null && Date.now() - checkedAt < RECHECK_MS) return cached;
  try {
    cached = (await prisma.user.count()) > 0;
  } catch {
    // A database that cannot be reached is not a reason to let everybody in. The pages behind
    // this will fail on their own and say something more useful than the proxy could.
    return cached ?? false;
  }
  checkedAt = Date.now();
  return cached;
}

/**
 * Drop the cached answer.
 *
 * Reaches only the caller's own copy of this module — which is the route handlers, not the
 * proxy (see above). Worth doing anyway: it is what stops the login route accepting the shared
 * password in the seconds after the first account is created.
 */
export function forgetUserCount(): void {
  cached = null;
  checkedAt = 0;
}
