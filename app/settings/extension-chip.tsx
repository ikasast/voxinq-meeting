"use client";

import Link from "next/link";
import { PuzzleIcon } from "../icons";
import type { ExtensionId } from "@/lib/extensions";

// Which extension a setting belongs to. They were mixed in with the core settings of each tab,
// and nothing said that "Japanese translation" was Translation's or that the questions model was
// Questions' (2026-11-03). Now they sit together at the foot of the tab, each with this mark.
// For an administrator it opens that extension's card under Administration → Extensions.

const CHIP =
  "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-[color-mix(in_srgb,var(--extension)_40%,transparent)] bg-[color-mix(in_srgb,var(--extension)_8%,transparent)] px-2 py-0.5 text-[11px] font-medium text-[var(--extension)]";

export function ExtensionChip({ id, name, isAdmin }: { id: ExtensionId; name: string; isAdmin: boolean }) {
  const inner = (
    <>
      <PuzzleIcon className="h-3 w-3" />
      {name}
    </>
  );
  return isAdmin ? (
    <Link href={`/admin?tab=extensions&open=${id}`} className={`${CHIP} hover:underline`}>
      {inner}
    </Link>
  ) : (
    <span className={CHIP}>{inner}</span>
  );
}

/** The heading over a tab's extension settings, so the core ones above end where it starts. */
export function ExtensionSettingsHeading({ children }: { children: string }) {
  return (
    <h3 className="mt-8 border-t border-[var(--border)] pt-4 text-sm font-semibold text-[var(--text-strong)]">
      {children}
    </h3>
  );
}
