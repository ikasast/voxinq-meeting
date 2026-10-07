"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";
import { createBackGuards, type BackGuards, type Guard, type OnBack } from "@/lib/back-guard";

// The React side of lib/back-guard.ts: one set of guards for the window, and a hook for anything
// that opens over the page.

let guards: BackGuards | null = null;

export function backGuards(): BackGuards {
  guards ??= createBackGuards(window);
  return guards;
}

/**
 * While `open`, Back calls `onBack` (usually: close) instead of leaving the page.
 *
 * Returns `release`, which resolves once the guard's history entry is gone. Anything that closes
 * itself and then navigates or reports back awaits it first; otherwise the navigation can land
 * before the Back that takes the entry out, and that Back then undoes it.
 */
export function useBackGuard(open: boolean, onBack: OnBack): () => Promise<void> {
  const onBackRef = useRef(onBack);
  useEffect(() => {
    onBackRef.current = onBack;
  });
  const guard = useRef<Guard | null>(null);

  useEffect(() => {
    if (!open) return;
    const g = backGuards().arm(() => onBackRef.current());
    guard.current = g;
    return () => {
      if (guard.current === g) guard.current = null;
      void backGuards().release(g);
    };
  }, [open]);

  return useCallback(() => {
    const g = guard.current;
    guard.current = null;
    return g ? backGuards().release(g) : backGuards().settled();
  }, []);
}

/**
 * For a menu with links in it, as `onClickCapture` on the menu: a click on a link closes the
 * menu, waits for its entry to go, and only then navigates — so the page left behind is not
 * followed in the history by an entry for a menu nobody can see any more.
 */
export function useLinksAfterClosing(close: () => void, release: () => Promise<void>) {
  const router = useRouter();
  return useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element).closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target || a.hasAttribute("download")) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      e.preventDefault();
      close();
      void release().then(() => router.push(`${url.pathname}${url.search}${url.hash}`));
    },
    [close, release, router],
  );
}
