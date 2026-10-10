// The Android app's version against the server's, for offering the app an update (app-update.tsx).
//
// The app says its version in its user agent ("VoxinqAndroid/4.0.0-beta.2"). The server knows its
// own. The app should match the server it talks to — not GitHub's newest, which may be a version
// the server is not running.

/** The app's version from a user agent, or null when it is not the app. */
export function appVersionFrom(userAgent: string): string | null {
  return /VoxinqAndroid\/(\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?)/.exec(userAgent)?.[1] ?? null;
}

/** Semver order, prereleases before their release: 4.0.0-beta.2 < 4.0.0-beta.10 < 4.0.0. */
export function compareVersions(a: string, b: string): number {
  const split = (v: string) => {
    const [core, pre] = v.split("-", 2) as [string, string | undefined];
    return { core: core.split(".").map(Number), pre: pre ? pre.split(".") : null };
  };
  const x = split(a);
  const y = split(b);
  for (let i = 0; i < 3; i++) {
    const d = (x.core[i] ?? 0) - (y.core[i] ?? 0);
    if (d !== 0) return Math.sign(d);
  }
  if (!x.pre && !y.pre) return 0;
  if (!x.pre) return 1;
  if (!y.pre) return -1;
  for (let i = 0; i < Math.max(x.pre.length, y.pre.length); i++) {
    const p = x.pre[i];
    const q = y.pre[i];
    if (p === undefined) return -1;
    if (q === undefined) return 1;
    const pn = /^\d+$/.test(p);
    const qn = /^\d+$/.test(q);
    if (pn && qn) {
      const d = Number(p) - Number(q);
      if (d !== 0) return Math.sign(d);
    } else if (pn !== qn) {
      return pn ? -1 : 1;
    } else if (p !== q) {
      return p < q ? -1 : 1;
    }
  }
  return 0;
}

/** The first app that can update itself; an older one is sent to the release page instead. */
export const SELF_UPDATE_FROM = "4.0.0-beta.3";

/** The release a version's APK is attached to. */
export function releasePage(version: string): string {
  return `https://github.com/ikasast/voxinq-meeting/releases/tag/v${version}`;
}
