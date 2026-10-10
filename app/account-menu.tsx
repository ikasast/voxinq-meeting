"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Avatar } from "./avatar";
import { GearIcon, PeopleIcon, PersonIcon, SignOutIcon, StorageIcon } from "./icons";
import { useT } from "./locale-provider";
import { useBackGuard, useLinksAfterClosing } from "./use-back-guard";

const MENU_W = 208; // w-52
const GAP = 6;
const PAD = 8;

// Who you are, and the three things that follow from it.
//
// This replaced a bare "Log out" button. Signing out was the only account-shaped thing the app
// offered, so it was the only thing in the corner — now that people have names and faces, the
// corner should say whose session this is, and signing out is one item inside that rather than
// the whole of it.
//
// Positioned from the button's rect in a portal, the same as the per-meeting menu, so it is not
// clipped by the header's bounds on a narrow screen.
export function AccountMenu({
  username,
  name,
  hasImage,
  isAdmin,
  via,
}: {
  username: string;
  name: string | null;
  hasImage: boolean;
  isAdmin: boolean;
  via: "session" | "tailnet";
}) {
  const [open, setOpen] = useState(false);
  const t = useT();
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const openMenu = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (r) {
      // The button is in the sidebar's foot: at the bottom of the screen, and on a phone at its
      // left edge. So the menu opens above it when the lower half has no room, and from its left
      // edge, kept inside the window either way. (It used to hang below and to the left of the
      // button, which on a phone is off the screen in both directions.)
      const left = Math.max(PAD, Math.min(r.left, window.innerWidth - MENU_W - PAD));
      setPos(
        r.top > window.innerHeight / 2
          ? { left, bottom: Math.max(PAD, window.innerHeight - r.top + GAP) }
          : { left, top: r.bottom + GAP },
      );
    }
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Back closes the menu; a link in it closes it first and then goes.
  const close = useCallback(() => setOpen(false), []);
  const releaseBack = useBackGuard(open, close);
  const followLink = useLinksAfterClosing(close, releaseBack);

  const signOut = async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    // A full load, not router.push: the session cookie is gone and the proxy has to be asked
    // again what this browser may see.
    window.location.href = "/login";
  };

  const item =
    "flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[var(--text-secondary)] hover:bg-[var(--hover-surface)]";

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => (open ? setOpen(false) : openMenu())}
        className="rounded-full ring-offset-2 ring-offset-[var(--header)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        title={name || username}
        aria-label={t("Your account")}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <Avatar username={username} name={name} hasImage={hasImage} size={32} />
      </button>

      {open && pos && typeof document !== "undefined"
        ? createPortal(
            <>
              <button
                type="button"
                aria-hidden
                tabIndex={-1}
                onClick={() => setOpen(false)}
                className="fixed inset-0 z-40 cursor-default bg-black/30 sm:bg-transparent"
              />
              <div
                role="menu"
                onClickCapture={followLink}
                style={{ left: pos.left, top: pos.top, bottom: pos.bottom, width: MENU_W, maxHeight: `calc(100dvh - ${2 * PAD}px)` }}
                className="fixed z-50 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-lg"
              >
                <div className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-2.5">
                  <Avatar username={username} name={name} hasImage={hasImage} size={32} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[var(--text-strong)]">
                      {name || username}
                    </p>
                    <p className="truncate text-xs text-[var(--text-muted)]">
                      {isAdmin ? t("Administrator") : username}
                      {via === "tailnet" ? ` · ${t("via tailnet")}` : ""}
                    </p>
                  </div>
                </div>

                <Link href="/account" className={item} role="menuitem" onClick={() => setOpen(false)}>
                  <PersonIcon className="h-4 w-4" />
                  {t("Account")}
                </Link>
                <Link href="/settings" className={item} role="menuitem" onClick={() => setOpen(false)}>
                  <GearIcon className="h-4 w-4" />
                  {t("Settings")}
                </Link>
                <Link href="/storage" className={item} role="menuitem" onClick={() => setOpen(false)}>
                  <StorageIcon className="h-4 w-4" />
                  {t("Storage")}
                </Link>
                {/* The rail carries this on a desktop and does not exist on a phone, which
                    would leave an administrator no way to reach it from the device they
                    actually have with them. */}
                {isAdmin ? (
                  <Link href="/admin" className={item} role="menuitem" onClick={() => setOpen(false)}>
                    <PeopleIcon className="h-4 w-4" />
                    {t("People")}
                  </Link>
                ) : null}
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => void signOut()}
                  className={`${item} border-t border-[var(--border)]`}
                >
                  <SignOutIcon className="h-4 w-4" />
                  {t("Log out")}
                </button>
              </div>
            </>,
            document.body,
          )
        : null}
    </>
  );
}
