"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  CloseIcon,
  GearIcon,
  HelpIcon,
  MenuIcon,
  PanelLeftIcon,
  PeopleIcon,
  PinIcon,
  PlusCircleIcon,
  QueueIcon,
  SearchIcon,
  SeriesIcon,
} from "./icons";
import { isAuthPath } from "./auth-paths";
import { useMyQueueCount } from "./use-my-queue-count";
import { useT } from "./locale-provider";
import { useExtensions } from "./extensions-provider";
import type { SidebarMeeting } from "./sidebar-meetings";

// v4's one way around the app (design B): a sidebar with the meetings in it, beside one main
// screen. New meeting and search at the top, the meetings by day, settings and the account at
// the foot. It folds to a narrow strip of icons or closes altogether, remembered per device; on a
// phone it is a drawer from the left, opened from the bar along the top.

type Mode = "open" | "rail" | "closed";
const MODE_KEY = "voxinq.sidebar";

function readMode(): Mode {
  try {
    const v = localStorage.getItem(MODE_KEY);
    return v === "rail" || v === "closed" ? v : "open";
  } catch {
    return "open";
  }
}

function saveMode(m: Mode) {
  try {
    localStorage.setItem(MODE_KEY, m);
  } catch {}
}

type Group = { key: string; label: string; items: SidebarMeeting[] };

/** Pinned first, then upcoming, then by when they were, in this device's own days. */
function grouped(meetings: SidebarMeeting[], t: (k: string) => string): Group[] {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const day = 86_400_000;
  const groups: Group[] = [
    { key: "pinned", label: t("Pinned"), items: [] },
    { key: "upcoming", label: t("Upcoming"), items: [] },
    { key: "today", label: t("Today"), items: [] },
    { key: "yesterday", label: t("Yesterday"), items: [] },
    { key: "week", label: t("This week"), items: [] },
    { key: "earlier", label: t("Earlier"), items: [] },
  ];
  for (const m of meetings) {
    const at = new Date(m.at).getTime();
    const g = m.pinned
      ? 0
      : m.upcoming
        ? 1
        : at >= today
          ? 2
          : at >= today - day
            ? 3
            : at >= today - 6 * day
              ? 4
              : 5;
    groups[g].items.push(m);
  }
  // Soonest first among the booked; the rest arrive newest first already.
  groups[1].items.sort((a, b) => a.at.localeCompare(b.at));
  return groups.filter((g) => g.items.length > 0);
}

export function Sidebar({
  meetings,
  external,
  isAdmin,
  version,
  docsUrl,
  account,
  extras,
}: {
  meetings: SidebarMeeting[];
  external: boolean;
  isAdmin: boolean;
  version: string;
  docsUrl: string;
  /** The account menu, rendered by the layout (it is a server-fed component). */
  account: ReactNode;
  /** What else belongs at the foot on this device: install, the theme for a visitor. */
  extras: ReactNode;
}) {
  const t = useT();
  const pathname = usePathname();
  const router = useRouter();
  const extensions = useExtensions();
  const queued = useMyQueueCount();
  const [mode, setMode] = useState<Mode>("open");
  const [drawer, setDrawer] = useState(false);
  const search = useRef<HTMLInputElement>(null);

  useEffect(() => setMode(readMode()), []);
  // A page opened from the drawer closes it: the drawer covers what was opened.
  useEffect(() => setDrawer(false), [pathname]);

  const groups = useMemo(() => grouped(meetings, t), [meetings, t]);
  if (isAuthPath(pathname)) return null;

  const change = (m: Mode) => {
    setMode(m);
    saveMode(m);
  };

  const activeId = pathname.split("/")[1] ?? "";

  const togglePin = async (m: SidebarMeeting) => {
    const res = await fetch(`/api/meetings/${m.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pinned: !m.pinned }),
    }).catch(() => null);
    if (res?.ok) router.refresh();
  };

  const list = (
    <nav aria-label={t("Meetings")} className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
      {groups.length === 0 ? (
        <p className="px-2 py-3 text-xs text-[var(--text-muted)]">{t("No meetings yet.")}</p>
      ) : (
        groups.map((g) => (
          <div key={g.key} className="mt-3">
            <p className="px-2 pb-1 text-[11px] font-medium text-[var(--text-muted)]">{g.label}</p>
            <ul>
              {g.items.map((m) => (
                <li key={m.id} className="group relative">
                  <Link
                    href={`/${m.id}`}
                    aria-current={m.id === activeId ? "page" : undefined}
                    className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm ${
                      m.id === activeId
                        ? "bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] text-[var(--text-strong)]"
                        : "text-[var(--text-secondary)] hover:bg-[var(--hover-surface)] hover:text-[var(--foreground)]"
                    }`}
                  >
                    <span className="min-w-0 flex-1 truncate">{m.title}</span>
                    {m.live ? (
                      <span
                        className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-[var(--error)]"
                        title={t("Recording")}
                        aria-label={t("Recording")}
                      />
                    ) : m.noMinutes ? (
                      <span
                        className="h-2 w-2 shrink-0 rounded-full bg-[var(--warning)]"
                        title={t("No minutes")}
                        aria-label={t("No minutes")}
                      />
                    ) : null}
                  </Link>
                  {/* Out of sight until the row is pointed at; it covers the row's dot meanwhile. */}
                  {!external ? (
                    <button
                      type="button"
                      onClick={() => void togglePin(m)}
                      title={m.pinned ? t("Unpin") : t("Pin")}
                      aria-label={`${m.pinned ? t("Unpin") : t("Pin")}: ${m.title}`}
                      aria-pressed={m.pinned}
                      className={`absolute right-1 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded bg-[var(--hover-surface)] opacity-0 group-hover:opacity-100 focus-visible:opacity-100 ${
                        m.pinned
                          ? "text-[var(--accent)] hover:text-[var(--text-muted)]"
                          : "text-[var(--text-muted)] hover:text-[var(--foreground)]"
                      }`}
                    >
                      <PinIcon className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
      <Link
        href="/?list=1"
        className="mt-3 block rounded-md px-2 py-1.5 text-xs text-[var(--accent-sub)] hover:bg-[var(--hover-surface)]"
      >
        {t("All meetings")}
      </Link>
    </nav>
  );

  const footLinks = (rail: boolean) => (
    <div className={rail ? "flex flex-col items-center gap-1" : "flex flex-col gap-0.5"}>
      {extensions.series ? (
        <FootLink rail={rail} href="/series" label={t("Series")} active={pathname.startsWith("/series")}>
          <SeriesIcon />
        </FootLink>
      ) : null}
      {!external ? (
        <FootLink rail={rail} href="/queue" label={t("Queue")} active={pathname === "/queue"} badge={queued}>
          <QueueIcon />
        </FootLink>
      ) : null}
      {!external && isAdmin ? (
        <FootLink rail={rail} href="/admin" label={t("People")} active={pathname.startsWith("/admin")}>
          <PeopleIcon />
        </FootLink>
      ) : null}
      <FootLink rail={rail} href={docsUrl} label={t("Help")} active={false} external>
        <HelpIcon />
      </FootLink>
      {!external ? (
        <FootLink rail={rail} href="/settings" label={t("Settings")} active={pathname.startsWith("/settings")}>
          <GearIcon />
        </FootLink>
      ) : null}
    </div>
  );

  const full = (inDrawer: boolean) => (
    <div className="flex h-full w-72 flex-col border-r border-[var(--border)] bg-[var(--panel)]">
      <div className="flex items-center gap-1 px-3 pb-2 pt-3">
        <Link href="/" aria-label={t("Voxinq Meeting home")} className="mr-auto flex items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="Voxinq Meeting" className="logo-dark h-7 w-auto" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-light.svg" alt="Voxinq Meeting" className="logo-light h-7 w-auto" />
        </Link>
        {inDrawer ? (
          <IconButton label={t("Close the sidebar")} onClick={() => setDrawer(false)}>
            <CloseIcon className="h-5 w-5" />
          </IconButton>
        ) : (
          <>
            <IconButton label={t("Fold the sidebar")} onClick={() => change("rail")}>
              <PanelLeftIcon className="h-5 w-5" />
            </IconButton>
            <IconButton label={t("Close the sidebar")} onClick={() => change("closed")}>
              <CloseIcon className="h-5 w-5" />
            </IconButton>
          </>
        )}
      </div>
      <div className="space-y-2 px-3">
        <Link
          href="/"
          className="flex items-center justify-center gap-2 rounded-full bg-[var(--accent-solid)] px-4 py-2 text-sm font-medium text-[var(--accent-contrast)] hover:bg-[var(--accent-hover)]"
        >
          <PlusCircleIcon className="h-4 w-4" />
          {t("New meeting")}
        </Link>
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            const q = search.current?.value.trim();
            router.push(q ? `/?q=${encodeURIComponent(q)}` : "/?list=1");
          }}
          className="relative"
        >
          <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            ref={search}
            type="search"
            placeholder={t("Search meetings")}
            aria-label={t("Search meetings")}
            className="input !mt-0 w-full !py-1.5 !pl-8 text-sm"
          />
        </form>
      </div>
      {list}
      <div className="border-t border-[var(--border)] px-2 py-2">
        {footLinks(false)}
        <div className="mt-2 flex items-center gap-2 px-2">
          {account}
          <span className="ml-auto flex items-center gap-1">{extras}</span>
        </div>
        <p className="mt-1 px-2 text-[10px] text-[var(--text-muted)]">v{version}</p>
      </div>
    </div>
  );

  const rail = (
    <div className="flex h-full w-14 flex-col items-center gap-1 border-r border-[var(--border)] bg-[var(--panel)] py-3">
      <IconButton label={t("Open the sidebar")} onClick={() => change("open")}>
        <PanelLeftIcon className="h-5 w-5" />
      </IconButton>
      <Link
        href="/"
        title={t("New meeting")}
        aria-label={t("New meeting")}
        className="mt-1 flex h-9 w-9 items-center justify-center rounded-full bg-[var(--accent-solid)] text-[var(--accent-contrast)] hover:bg-[var(--accent-hover)]"
      >
        <PlusCircleIcon className="h-5 w-5" />
      </Link>
      <IconButton
        label={t("Search meetings")}
        onClick={() => {
          change("open");
          setTimeout(() => search.current?.focus(), 50);
        }}
      >
        <SearchIcon className="h-5 w-5" />
      </IconButton>
      <div className="flex-1" />
      {footLinks(true)}
      <div className="mt-1">{account}</div>
    </div>
  );

  return (
    <>
      {/* A phone: the bar along the top, and the drawer it opens. */}
      <div className="sticky top-0 z-30 flex items-center gap-2 border-b border-[var(--border)] bg-[var(--header)] px-3 py-2 lg:hidden">
        <IconButton label={t("Open the sidebar")} onClick={() => setDrawer(true)}>
          <MenuIcon className="h-5 w-5" />
        </IconButton>
        <Link href="/" aria-label={t("Voxinq Meeting home")} className="mr-auto flex items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="Voxinq Meeting" className="logo-dark h-7 w-auto" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-light.svg" alt="Voxinq Meeting" className="logo-light h-7 w-auto" />
        </Link>
        <Link
          href="/"
          title={t("New meeting")}
          aria-label={t("New meeting")}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--accent-solid)] text-[var(--accent-contrast)]"
        >
          <PlusCircleIcon className="h-5 w-5" />
        </Link>
      </div>
      {drawer ? (
        <div className="fixed inset-0 z-50 flex lg:hidden" role="dialog" aria-modal="true">
          {full(true)}
          <button
            type="button"
            aria-label={t("Close the sidebar")}
            className="flex-1 bg-black/50"
            onClick={() => setDrawer(false)}
          />
        </div>
      ) : null}

      {/* A wide screen: beside the page, open, folded to a strip, or closed. */}
      <aside className="sticky top-0 hidden h-dvh shrink-0 lg:block">
        {mode === "open" ? full(false) : mode === "rail" ? rail : null}
      </aside>
      {mode === "closed" ? (
        <div className="fixed left-3 top-3 z-30 hidden lg:block">
          <IconButton label={t("Open the sidebar")} onClick={() => change("open")}>
            <PanelLeftIcon className="h-5 w-5" />
          </IconButton>
        </div>
      ) : null}
    </>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="flex h-9 w-9 items-center justify-center rounded-md text-[var(--text-secondary)] hover:bg-[var(--hover-surface)] hover:text-[var(--foreground)]"
    >
      {children}
    </button>
  );
}

function FootLink({
  rail,
  href,
  label,
  active,
  badge = 0,
  external = false,
  children,
}: {
  rail: boolean;
  href: string;
  label: string;
  active: boolean;
  badge?: number;
  external?: boolean;
  children: ReactNode;
}) {
  const cls = `relative flex items-center rounded-md text-sm ${
    rail ? "h-9 w-9 justify-center" : "gap-2.5 px-2 py-1.5"
  } ${
    active
      ? "bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] text-[var(--text-strong)]"
      : "text-[var(--text-secondary)] hover:bg-[var(--hover-surface)] hover:text-[var(--foreground)]"
  } [&_svg]:h-[18px] [&_svg]:w-[18px]`;
  const inner = (
    <>
      {children}
      {rail ? null : <span>{label}</span>}
      {badge > 0 ? (
        <span
          className={`rounded-full bg-[var(--accent-solid)] px-1.5 text-[10px] font-semibold text-[var(--accent-contrast)] ${
            rail ? "absolute -right-1 -top-1" : "ml-auto"
          }`}
        >
          {badge}
        </span>
      ) : null}
    </>
  );
  return external ? (
    <a href={href} target="_blank" rel="noreferrer" title={label} aria-label={label} className={cls}>
      {inner}
    </a>
  ) : (
    <Link href={href} title={label} aria-label={label} aria-current={active ? "page" : undefined} className={cls}>
      {inner}
    </Link>
  );
}
