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
  PinnedIcon,
  PlusCircleIcon,
  QueueIcon,
  SearchIcon,
  SeriesIcon,
} from "./icons";
import { isAuthPath } from "./auth-paths";
import { type QueuedJob, useQueue } from "./use-my-queue-count";
import { busyLabel } from "@/lib/queue/job-label";
import { useT } from "./locale-provider";
import { useRecorderState } from "./recorder";
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
  const { jobs: queueJobs, mine: queued } = useQueue();
  const [mode, setMode] = useState<Mode>("open");
  // What the sidebar shows while its width moves. Growing, the new contents go in at once and
  // are uncovered as it widens; shrinking, the old ones stay until it has finished, so a strip
  // never stands alone in a gap that is still closing. Closed, whatever was last shown slides
  // out of sight.
  const [shown, setShown] = useState<Mode>("open");
  // No slide on the first paint: the saved mode is read after it, and the sidebar should simply
  // be in it, not travel there.
  const [ready, setReady] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const search = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const m = readMode();
    setMode(m);
    setShown(m === "closed" ? "open" : m);
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, []);
  // A page opened from the drawer closes it: the drawer covers what was opened.
  useEffect(() => setDrawer(false), [pathname]);

  const groups = useMemo(() => grouped(meetings, t), [meetings, t]);
  if (isAuthPath(pathname)) return null;

  const change = (m: Mode) => {
    setMode(m);
    saveMode(m);
    if (m === "open" || (m === "rail" && mode === "closed")) setShown(m);
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
          <div
            key={g.key}
            className={g.key === "pinned" ? "mt-3 border-b border-[var(--border)] pb-3" : "mt-3"}
          >
            <p className="px-2 pb-1 text-[11px] font-medium text-[var(--text-muted)]">{g.label}</p>
            <ul>
              {g.items.map((m) => (
                <li key={m.id} className="group relative">
                  <Link
                    href={`/${m.id}`}
                    aria-current={m.id === activeId ? "page" : undefined}
                    className={`flex items-center gap-2 rounded-md py-1.5 pl-2 pr-8 text-sm ${
                      m.id === activeId
                        ? "bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] text-[var(--text-strong)]"
                        : "text-[var(--text-secondary)] hover:bg-[var(--hover-surface)] hover:text-[var(--foreground)]"
                    }`}
                  >
                    {/* Being recorded: a record button's red dot before the name, breathing slowly.
                        Before the name rather than at the end, where the pin goes and where an
                        unexplained dot read as nothing in particular. ("No minutes" has no mark
                        for now.) */}
                    <LiveDot id={m.id} live={m.live} />
                    <span className="min-w-0 flex-1 truncate">{m.title}</span>
                  </Link>
                  {/* A pinned meeting shows its pin standing straight, always; any other shows a tilted
                      one when the row is pointed at, to pin it. From outside, only the mark. */}
                  {!external ? (
                    <button
                      type="button"
                      onClick={() => void togglePin(m)}
                      title={m.pinned ? t("Unpin") : t("Pin")}
                      aria-label={`${m.pinned ? t("Unpin") : t("Pin")}: ${m.title}`}
                      aria-pressed={m.pinned}
                      className={`absolute right-1 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded hover:bg-[var(--hover-surface)] ${
                        m.pinned
                          ? "text-[var(--accent)]"
                          : "text-[var(--text-muted)] opacity-0 hover:text-[var(--foreground)] group-hover:opacity-100 focus-visible:opacity-100"
                      }`}
                    >
                      {m.pinned ? <PinnedIcon className="h-3.5 w-3.5" /> : <PinIcon className="h-3.5 w-3.5" />}
                    </button>
                  ) : m.pinned ? (
                    <PinnedIcon
                      aria-hidden
                      className="absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--accent)]"
                    />
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
          className="btn-ink w-full"
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
        <QueueNow jobs={queueJobs} />
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
        className="btn-icon-accent mt-1"
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
          className="btn-icon-accent"
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
      <aside
        inert={mode === "closed"}
        onTransitionEnd={(e) => {
          if (e.target === e.currentTarget && mode !== "closed") setShown(mode);
        }}
        className={`sticky top-0 hidden h-dvh shrink-0 overflow-hidden lg:block ${
          ready ? "transition-[width] duration-300 ease-out motion-reduce:transition-none" : ""
        } ${mode === "open" ? "w-72" : mode === "rail" ? "w-14" : "w-0"}`}
      >
        {shown === "rail" ? rail : full(false)}
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

/**
 * Being recorded: a record button's red dot before the name, breathing slowly. The server knows
 * a meeting is live once a line has been saved into it; this tab knows sooner — from the first
 * second of its own recording, and on a machine that only transcribes at the end, when no line
 * is saved until then. Its own component, so the list does not re-render as words are heard.
 */
function LiveDot({ id, live }: { id: string; live: boolean }) {
  const t = useT();
  const { session } = useRecorderState();
  if (!live && session?.meetingId !== id) return null;
  return (
    <span
      role="img"
      aria-label={t("Recording")}
      title={t("Recording")}
      className="recording-dot inline-block h-3 w-3 shrink-0 rounded-full border border-[color-mix(in_srgb,var(--error)_45%,transparent)] p-px"
    >
      <span className="block h-full w-full rounded-full bg-[var(--error)]" />
    </span>
  );
}

/**
 * What the GPU is doing now, and how much is waiting behind it — one line over the sidebar's
 * foot, there only while there is something (v4). It used to take opening the queue page to
 * learn why your minutes had not started; the page is still one tap away, for reordering,
 * cancelling and what already ran. Somebody else's work is named by its kind alone.
 */
function QueueNow({ jobs }: { jobs: QueuedJob[] }) {
  const t = useT();
  const running = jobs.find((j) => j.status === "running");
  const waiting = jobs.filter((j) => j.status === "queued").length;
  if (!running && waiting === 0) return null;
  const what = running
    ? `${busyLabel(t, running.kind)}${running.mine && running.title ? ` ${running.title}` : ""}`
    : t("Waiting for the GPU");
  return (
    <Link
      href="/queue"
      title={t("Open the queue")}
      className="mb-1 flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--hover-surface)] hover:text-[var(--foreground)]"
    >
      <span
        aria-hidden
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${running ? "animate-pulse bg-[var(--accent)]" : "bg-[var(--text-muted)]"}`}
      />
      <span className="min-w-0 flex-1 truncate">{what}</span>
      {waiting > 0 ? (
        <span className="shrink-0 tabular-nums text-[var(--text-muted)]">{t("+{n} waiting", { n: waiting })}</span>
      ) : null}
    </Link>
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
