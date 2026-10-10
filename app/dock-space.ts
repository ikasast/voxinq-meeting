"use client";

import { useEffect } from "react";

/**
 * Say that something is fixed to the bottom of the window — a recording's dock or bar — so what
 * floats in a bottom corner (the Ask button) can stand above it rather than on it. Only phones
 * need it: from `sm` up the corner is clear of the centred dock, and globals.css sets it to 0.
 */
export function useDockSpace(active: boolean, space = "6rem") {
  useEffect(() => {
    if (!active) return;
    const root = document.documentElement;
    root.style.setProperty("--dock-space", space);
    return () => {
      root.style.removeProperty("--dock-space");
    };
  }, [active, space]);
}
