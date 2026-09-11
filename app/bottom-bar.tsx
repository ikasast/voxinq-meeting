"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MeetingsIcon, MicIcon, QueueIcon } from "./icons";
import { isAuthPath } from "./auth-paths";
import { useMyQueueCount } from "./queue-header-link";
import { useT } from "./locale-provider";

// Recording, within reach of a thumb.
//
// The app grew: the way to a recording ran through a top bar that had collected five icons, and
// the microphone was one of them — smallest target, furthest corner, no label. Somebody opening
// this for the first time on a phone had no reason to think the app was for recording at all.
//
// So the two destinations that matter on a phone come down here, either side of the one action
// the app exists for. It is the shape of a camera app on purpose: the round thing in the middle
// is understood without being read. The word under it is there anyway — a microphone glyph
// alone says "audio", not "start recording now".
//
// The rail does this job from `lg` up, so this is strictly the narrow layout.

const HIDDEN = [
  // The recording screen has its own full-width Start recording along the bottom. Two record
  // buttons on one screen, one of which leaves the meeting you are recording, is worse than none.
  /^\/[^/]+\/recording$/,
  // A redirect in progress. It is already doing what this button asks for.
  /^\/quick-record$/,
];

function Slot({
  href,
  label,
  active,
  badge,
  children,
}: {
  href: string;
  label: string;
  active: boolean;
  badge?: number;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`relative flex min-w-[64px] flex-col items-center gap-0.5 px-2 py-1 text-[11px] ${
        active ? "text-[var(--accent-solid)]" : "text-[var(--text-muted)]"
      }`}
    >
      {children}
      {label}
      {badge && badge > 0 ? (
        <span className="absolute right-1 top-0 min-w-[15px] rounded-full bg-[var(--accent-solid)] px-1 text-center text-[10px] font-semibold leading-[15px] text-[var(--accent-contrast)]">
          {badge}
        </span>
      ) : null}
    </Link>
  );
}

export function BottomBar({ external }: { external: boolean }) {
  const pathname = usePathname() ?? "/";
  const mine = useMyQueueCount();
  const t = useT();
  // Recording is refused server-side from outside the tailnet, so an external visitor gets no
  // button for it. A control that is only ever going to 403 is worse than its absence.
  // Nor before anybody is identified: offering to record on the sign-in screen promises
  // something the next tap would refuse.
  if (external || isAuthPath(pathname) || HIDDEN.some((re) => re.test(pathname))) return null;

  const onMeetings = pathname === "/" || /^\/[^/]+$/.test(pathname);
  return (
    <>
      {/* In the flow, so the last row of a list is not left underneath the bar. Rendering it
          here rather than as padding on `main` keeps the two from drifting apart: the bar and
          the room it needs are the same component. */}
      <div className="h-[76px] lg:hidden" aria-hidden />
      <nav
        aria-label={t("Record")}
        className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border)] bg-[color-mix(in_srgb,var(--background)_92%,transparent)] backdrop-blur lg:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="mx-auto flex max-w-md items-end justify-around px-4 pb-1 pt-1.5">
          <Slot href="/" label={t("Meetings")} active={onMeetings}>
            <MeetingsIcon className="h-[22px] w-[22px]" />
          </Slot>

          {/* Raised, and the only accented thing down here. Everything else on this bar is
              navigation; this is the app doing its job. */}
          <Link
            href="/quick-record"
            aria-label={t("Record now")}
            className="-mt-7 flex flex-col items-center gap-1"
          >
            <span className="flex h-14 w-14 items-center justify-center rounded-full border-4 border-[var(--background)] bg-[var(--accent-solid)] text-[var(--accent-contrast)] shadow-lg">
              <MicIcon className="h-7 w-7" />
            </span>
            <span className="text-[11px] font-medium text-[var(--text-secondary)]">{t("Record now")}</span>
          </Link>

          <Slot href="/queue" label={t("Queue")} active={pathname === "/queue"} badge={mine}>
            <QueueIcon className="h-[22px] w-[22px]" />
          </Slot>
        </div>
      </nav>
    </>
  );
}
