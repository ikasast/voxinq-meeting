"use client";

import { useCallback, useEffect, useState } from "react";
import { readTheme, setTheme, watchSystemTheme, type Theme } from "@/lib/theme";

// Theme control for the header. Read-only external visitors cannot reach Settings, so
// without this they are stuck with whatever the device decided.
//
// One button cycling System -> Light -> Dark rather than a menu: three states, and the icon
// says which one is active.

const ORDER: Theme[] = ["system", "light", "dark"];
const LABEL: Record<Theme, string> = {
  system: "Theme: follows your device",
  light: "Theme: light",
  dark: "Theme: dark",
};

function Icon({ theme }: { theme: Theme }) {
  if (theme === "light") {
    // Sun
    return (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" strokeLinecap="round" />
      </svg>
    );
  }
  if (theme === "dark") {
    // Moon
    return (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" strokeLinejoin="round" />
      </svg>
    );
  }
  // System: half-filled circle
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3a9 9 0 0 1 0 18Z" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function ThemeToggle() {
  // Starts at the default and corrects itself on mount: the server cannot know what this
  // device chose, and rendering the stored value directly would mismatch during hydration.
  const [theme, setThemeLocal] = useState<Theme>("system");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setThemeLocal(readTheme());
    setReady(true);
  }, []);

  // While on "system", follow the OS switching without a reload.
  useEffect(() => watchSystemTheme(() => theme), [theme]);

  const cycle = useCallback(() => {
    const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];
    setThemeLocal(next);
    setTheme(next);
  }, [theme]);

  return (
    <button
      type="button"
      onClick={cycle}
      className="btn-icon"
      title={`${LABEL[theme]} — click to change`}
      aria-label={LABEL[theme]}
      // Nothing to show until the stored value is known; keeps the markup stable for hydration.
      style={{ visibility: ready ? "visible" : "hidden" }}
    >
      <Icon theme={theme} />
    </button>
  );
}
