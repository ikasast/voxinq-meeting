"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { applyDisplaySize, inAndroidApp, reportAfterReload, reportDisplaySize } from "./display-size";

// The page's size in the Android app (display-size.ts), held through navigation and rotation:
// turning the phone changes the width it is worked out from, and moving to another page puts
// the framework's own viewport back. Draws nothing.
//
// Not an effect on the pathname: the framework rewrites the viewport tag while it commits the
// new page, and on some pages that lands after such an effect has run — the size went back to
// 100% on the way to Settings, or to the top. Watching the tag itself catches the rewrite
// whenever it comes, and applyDisplaySize writes only when the content differs, so its own
// write does not set it off again.
export function DisplaySizeKeeper() {
  // Temporary (display-size.ts): what the phone shows after a load and after each navigation.
  const pathname = usePathname();
  useEffect(() => {
    const t = window.setTimeout(() => reportDisplaySize("page"), 700);
    return () => window.clearTimeout(t);
  }, [pathname]);
  useEffect(() => {
    reportAfterReload();
  }, []);
  useEffect(() => {
    if (!inAndroidApp()) return;
    const again = () => applyDisplaySize();
    const watch = new MutationObserver(again);
    watch.observe(document.head, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["content"],
    });
    const turned = () => window.setTimeout(again, 300);
    window.addEventListener("orientationchange", turned);
    again();
    return () => {
      watch.disconnect();
      window.removeEventListener("orientationchange", turned);
    };
  }, []);
  return null;
}
