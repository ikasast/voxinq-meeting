"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { GearIcon, HelpIcon, MeetingsIcon, MicIcon, PlusCircleIcon } from "./icons";

// Navigation as a rail down the left edge, on screens wide enough to spare it.
//
// The same four destinations were a row of icons in the top bar. Moving them here buys back the
// header's height on every page — the meeting screen is a three-column layout that wants the
// vertical room — and gives the app a fixed place to be, rather than a strip that scrolls out
// of the way like a website's.
//
// Below `lg` the top bar is still what renders: a vertical rail costs width, and width is the
// thing a phone has least of. Recording from a phone is a first-class use here, so the narrow
// layout is not an afterthought that can be given a worse version of this.
function RailLink({
  href,
  label,
  active,
  primary = false,
  children,
}: {
  href: string;
  label: string;
  active: boolean;
  /** The one action the app exists for. It was the only accented control in the top bar and
   *  has to stay the loudest thing here, or the rail flattens it into the furniture. */
  primary?: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      title={label}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      className={`flex w-full flex-col items-center gap-1 rounded-lg px-1 py-2 text-[10px] font-medium transition-colors ${
        active
          ? "bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] text-[var(--accent-sub)]"
          : "text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]"
      }`}
    >
      <span
        className={
          primary
            ? "flex h-9 w-9 items-center justify-center rounded-full bg-[var(--accent)] text-[var(--accent-contrast)]"
            : undefined
        }
      >
        {children}
      </span>
      <span className="text-center leading-tight">{label}</span>
    </Link>
  );
}

// The documentation lives on GitHub, not in the install: the images and the release tarball
// both exclude docs/ on purpose. That is not the compromise it sounds like -- this link opens
// in the reader's own browser, which is where an internet connection usually is, even when the
// machine running Voxinq has none.
//
// Pinned to the version this instance is running rather than to main, so nobody reads about a
// feature they do not have yet.
function DocsLink({ href }: { href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      title="Documentation (opens on GitHub)"
      aria-label="Documentation"
      className="flex w-full flex-col items-center gap-1 rounded-lg px-1 py-2 text-[10px] font-medium text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]"
    >
      <HelpIcon />
      <span className="text-center leading-tight">Help</span>
    </a>
  );
}

export function SideRail({ external, docsUrl }: { external: boolean; docsUrl: string }) {
  const pathname = usePathname();
  // A meeting's own page belongs to the list it came from, so the list stays lit while reading
  // one — otherwise the rail goes blank the moment you open anything.
  const onMeetings = !pathname.startsWith("/settings") && !pathname.startsWith("/new");

  return (
    <nav
      aria-label="Main"
      className="sticky top-0 hidden h-dvh w-[76px] shrink-0 flex-col items-center gap-1 border-r border-[var(--border)] bg-[var(--header)] px-2 py-3 lg:flex"
    >
      <Link href="/" aria-label="Voxinq Meeting home" className="mb-2 shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-mark.svg" alt="" aria-hidden className="logo-dark h-9 w-9" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-mark-light.svg" alt="" aria-hidden className="logo-light h-9 w-9" />
      </Link>

      <RailLink href="/" label="Meetings" active={onMeetings}>
        <MeetingsIcon />
      </RailLink>

      {!external ? (
        <>
          <RailLink href="/new" label="New meeting" active={pathname.startsWith("/new")} primary>
            <PlusCircleIcon />
          </RailLink>
          <RailLink href="/quick-record" label="Record NOW" active={pathname.startsWith("/quick-record")}>
            <MicIcon />
          </RailLink>
          {/* Settings sits at the bottom, away from the things used every day. */}
          <div className="mt-auto flex w-full flex-col gap-1">
            <DocsLink href={docsUrl} />
            <RailLink href="/settings" label="Settings" active={pathname.startsWith("/settings")}>
              <GearIcon />
            </RailLink>
          </div>
        </>
      ) : (
        <div className="mt-auto w-full">
          <DocsLink href={docsUrl} />
        </div>
      )}
    </nav>
  );
}
