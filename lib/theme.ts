// Light/dark handling (client-side only).
//
// The theme is a property of the device, not of the account: it lives in localStorage and
// never reaches the server. That is also what makes it available to read-only external
// visitors, who cannot open Settings.
//
// `system` follows the OS and keeps following it — switching the OS between light and dark
// updates the page without a reload.

export type Theme = "system" | "light" | "dark";

export const THEME_KEY = "voxinq.theme";
export const THEMES: { id: Theme; label: string }[] = [
  { id: "system", label: "System" },
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
];

/** The stored preference. Anything unrecognised — including the older bare "dark" — is `system`. */
export function readTheme(): Theme {
  try {
    const v = localStorage.getItem(THEME_KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    // Storage can be unavailable (private mode, embedded webview); the default still applies.
  }
  return "system";
}

/** What `system` currently means on this device. */
export function systemPrefersLight(): boolean {
  try {
    return window.matchMedia("(prefers-color-scheme: light)").matches;
  } catch {
    return false; // no matchMedia -> keep the dark default
  }
}

/** The theme actually in effect, with `system` resolved. */
export function resolveTheme(theme: Theme): "light" | "dark" {
  if (theme === "system") return systemPrefersLight() ? "light" : "dark";
  return theme;
}

/** Paint the resolved theme. The stylesheet is dark by default and opts into light. */
export function paintTheme(theme: Theme): void {
  if (resolveTheme(theme) === "light") document.documentElement.dataset.theme = "light";
  else delete document.documentElement.dataset.theme;
}

/** Store a choice and apply it immediately. */
export function setTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // ignore — the choice still applies for this page view
  }
  paintTheme(theme);
}

/**
 * Keep `system` in step with the OS while the page is open. Returns an unsubscribe function.
 * Harmless to call for a fixed theme: the listener simply repaints the same value.
 */
export function watchSystemTheme(getTheme: () => Theme): () => void {
  let mq: MediaQueryList;
  try {
    mq = window.matchMedia("(prefers-color-scheme: light)");
  } catch {
    return () => {};
  }
  const onChange = () => {
    if (getTheme() === "system") paintTheme("system");
  };
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}
