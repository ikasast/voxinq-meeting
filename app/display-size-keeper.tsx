"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { applyDisplaySize } from "./display-size";

// The page's size in the Android app (display-size.ts), held through navigation and rotation:
// moving to another page may put the framework's own viewport back, and turning the phone
// changes the width it is worked out from. Draws nothing.
export function DisplaySizeKeeper() {
  const pathname = usePathname();
  useEffect(() => {
    applyDisplaySize();
  }, [pathname]);
  useEffect(() => {
    const again = () => window.setTimeout(() => applyDisplaySize(), 300);
    window.addEventListener("orientationchange", again);
    return () => window.removeEventListener("orientationchange", again);
  }, []);
  return null;
}
