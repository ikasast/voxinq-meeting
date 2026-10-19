// How large the Android app draws the pages: text, icons and spacing together. Per device, like
// the theme, and only in the app.
//
// The phone's own font size already reaches the page, but it scales text alone: icons, padding
// and the columns beside a name stay as they were, and a meeting's name in a list is what gives
// way. Scaling the whole page keeps the layout as it is, only bigger, by laying it out for a
// narrower screen: 412 CSS px drawn at 115% is a page laid out at 358 px. The meta viewport says
// so; the app's WebView takes the initial-scale and lays the page out at the width it leaves
// (measured on Android 17: the same 358 px with or without useWideViewPort), so no app update is
// needed. In a browser, which has its own zoom, none of this applies.
//
// The same arithmetic is in the inline script in app/layout.tsx, which applies it before the
// first paint and cannot import this. Change one, change the other.
//
// And the server says it too. Changing the tag after the page has loaded was not enough: the
// framework puts its own viewport back on every navigation, and on the phone (Android 17's
// WebView) the page stayed at 100% after going back to the top even with the tag put right
// again at once. So the choice is also kept in a cookie (DISPLAY_COOKIE), and the root layout's
// generateViewport renders the tag from it — every page then arrives with the right one, and
// there is nothing for a navigation to undo.

import { appVersionFrom } from "@/lib/app-version";

/** The sizes offered, in percent. */
export const DISPLAY_SIZES = [100, 115, 130] as const;
export type DisplaySize = (typeof DISPLAY_SIZES)[number];

/** Until one is chosen: at 100% the app read a little small on a phone (asked 2026-10-17). */
export const DEFAULT_DISPLAY_SIZE: DisplaySize = 115;

export const DISPLAY_SIZE_KEY = "voxinq.displaySize";

/** The layout the server renders the viewport from: "<width>_<scale>", e.g. "317_1.3". */
export const DISPLAY_COOKIE = "voxinq_display";
const CHANGED = "voxinq:display-size";

/** The stored choice if it is one of the offered sizes, otherwise the default. */
export function displaySizeFrom(stored: string | null): DisplaySize {
  const n = stored === null ? NaN : Number(stored);
  return (DISPLAY_SIZES as readonly number[]).includes(n) ? (n as DisplaySize) : DEFAULT_DISPLAY_SIZE;
}

/** The meta viewport for a screen `screenWidth` CSS px wide drawn at `size` percent. */
export function viewportFor(size: number, screenWidth: number): string {
  if (size === 100 || !(screenWidth > 0)) return "width=device-width, initial-scale=1";
  return `width=${Math.round((screenWidth * 100) / size)}, initial-scale=${size / 100}`;
}

/** The cookie's value for a size on a screen that wide; null where the default tag is right. */
export function displayCookieFor(size: number, screenWidth: number): string | null {
  if (size === 100 || !(screenWidth > 0)) return null;
  return `${Math.round((screenWidth * 100) / size)}_${size / 100}`;
}

/**
 * The viewport the server renders, from the cookie. Only what this file could have written: a
 * width a phone has and one of the offered scales — the cookie arrives from the client.
 */
export function viewportFromCookie(value: string | undefined): { width: number; initialScale: number } | null {
  const m = /^(\d{3,4})_(\d(?:\.\d{1,2})?)$/.exec(value ?? "");
  if (!m) return null;
  const width = Number(m[1]);
  const initialScale = Number(m[2]);
  const offered = DISPLAY_SIZES.some((s) => s !== 100 && s / 100 === initialScale);
  if (!offered || width < 200 || width > 2000) return null;
  return { width, initialScale };
}

function writeDisplayCookie(size: number): void {
  const value = displayCookieFor(size, screen.width);
  try {
    document.cookie = value
      ? `${DISPLAY_COOKIE}=${value}; path=/; max-age=31536000; samesite=lax`
      : `${DISPLAY_COOKIE}=; path=/; max-age=0; samesite=lax`;
  } catch {
    // No cookies: the tag is still put right here, as before.
  }
}

export function inAndroidApp(): boolean {
  return typeof navigator !== "undefined" && appVersionFrom(navigator.userAgent) !== null;
}

/** For useSyncExternalStore: this device's size. */
export function readDisplaySize(): DisplaySize {
  try {
    return displaySizeFrom(localStorage.getItem(DISPLAY_SIZE_KEY));
  } catch {
    return DEFAULT_DISPLAY_SIZE;
  }
}

export function subscribeDisplaySize(fn: () => void): () => void {
  window.addEventListener(CHANGED, fn);
  return () => window.removeEventListener(CHANGED, fn);
}

/** Lay the page out for the chosen size, now. */
export function applyDisplaySize(size: number = readDisplaySize()): void {
  if (!inAndroidApp()) return;
  // Every time, not only when it is chosen: the width is the screen's, and turning the phone
  // changes it.
  writeDisplayCookie(size);
  const meta = document.querySelector('meta[name="viewport"]');
  const content = viewportFor(size, screen.width);
  if (meta && meta.getAttribute("content") !== content) meta.setAttribute("content", content);
}

export function writeDisplaySize(size: DisplaySize): void {
  try {
    localStorage.setItem(DISPLAY_SIZE_KEY, String(size));
  } catch {
    // No storage: the choice lasts as long as the page.
  }
  applyDisplaySize(size);
  window.dispatchEvent(new Event(CHANGED));
  // A WebView that did not take the new tag gets the page again, which arrives with the right one.
  // Loaded afresh rather than reloaded: a reload may bring back the zoom the page had.
  if (inAndroidApp()) {
    window.setTimeout(() => {
      const scale = window.visualViewport?.scale;
      if (scale !== undefined && Math.abs(scale - size / 100) > 0.03) window.location.replace(window.location.href);
    }, 400);
  }
}

