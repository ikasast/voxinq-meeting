"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type ReactNode, useEffect } from "react";

// "Back to list" that goes back, when back is where the list is.
//
// It used to be a plain link to "/": a new entry on top of the meeting, so the phone's own Back
// afterwards went to the meeting again — list, meeting, list, meeting — and the list it opened
// was a fresh one, without the day or series it had been narrowed to or where it was scrolled.
// When the page before this one is the list, this is Back itself, and the list comes back as it
// was left. Otherwise (opened from a notification or a shared link) it is the link it was.

const KEY = "voxinq.nav";

/**
 * Remembers the in-app page before this one. In the root layout, inside a Suspense boundary
 * (it reads the query string, which the list's filters live in).
 */
export function NavTracker() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  useEffect(() => {
    const here = search ? `${pathname}?${search}` : pathname;
    try {
      const was = JSON.parse(sessionStorage.getItem(KEY) ?? "null") as { cur?: string } | null;
      if (was?.cur === here) return;
      sessionStorage.setItem(KEY, JSON.stringify({ prev: was?.cur ?? null, cur: here }));
    } catch {
      // No storage (a private window, say): the link stays a link.
    }
  }, [pathname, search]);
  return null;
}

function previousPath(): string | null {
  try {
    const nav = JSON.parse(sessionStorage.getItem(KEY) ?? "null") as { prev?: string | null } | null;
    return nav?.prev ? nav.prev.split("?")[0] : null;
  } catch {
    return null;
  }
}

export function BackLink({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  const router = useRouter();
  return (
    <Link
      href={href}
      className={className}
      onClick={(e) => {
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        if (previousPath() !== href) return;
        e.preventDefault();
        router.back();
      }}
    >
      {children}
    </Link>
  );
}
