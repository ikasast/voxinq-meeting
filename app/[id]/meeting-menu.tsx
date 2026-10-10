"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { DropMenu, ICON_BUTTON, MENU_ITEM, MenuRule } from "../drop-menu";
import { CalendarPlusIcon, DotsIcon, PinIcon, PinnedIcon } from "../icons";
import { useT } from "../locale-provider";
import { DeleteMeetingButton } from "./delete-meeting-button";

// What is done to the meeting as a whole, beside its title: pin it, set up the next one in its
// series, bin it. (Archiving was removed in v4: pins, search and the trash cover it.)
//
// Icons in a row from a tablet up, beside the download, each named by its tooltip — they were
// behind "…", and a pin and a bin are pictures nobody has to be told about. On a phone the row
// would crowd the title, so there they stay behind "…" with their names.
//
// Pinning is here as well as on the sidebar's rows, because the sidebar lists only recent
// meetings: an older one is found by search or the full list, opened, and pinned from here.
//
// "The next meeting in this series" replaced "New with same settings" (v4), which copied the
// purpose, tags and series into a meeting and started recording at once. What a recurring
// meeting carries forward is its series — the people, the terms, last time's minutes — so this
// opens the New meeting form with the series filled in, where the next one can also be booked.

export function MeetingMenu({
  id,
  title,
  series,
  pinned,
}: {
  id: string;
  title: string;
  /** The series' name, when it has one and Series is switched on. */
  series: string | null;
  pinned: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const togglePin = async () => {
    const res = await fetch(`/api/meetings/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pinned: !pinned }),
    }).catch(() => null);
    if (res?.ok) router.refresh();
  };
  const pinLabel = pinned ? t("Unpin from the sidebar") : t("Pin to the sidebar");
  const PinGlyph = pinned ? PinnedIcon : PinIcon;
  const next = series ? `/new?series=${encodeURIComponent(series)}` : null;

  return (
    <>
      <span className="hidden items-center gap-0.5 sm:inline-flex">
        <button
          type="button"
          onClick={() => void togglePin()}
          title={pinLabel}
          aria-label={pinLabel}
          aria-pressed={pinned}
          className={`${ICON_BUTTON} ${pinned ? "!text-[var(--accent-sub)]" : ""}`}
        >
          <PinGlyph className="h-4 w-4" />
        </button>
        {next ? (
          <Link
            href={next}
            title={t("Next meeting in this series")}
            aria-label={t("Next meeting in this series")}
            className={ICON_BUTTON}
          >
            <CalendarPlusIcon className="h-4 w-4" />
          </Link>
        ) : null}
        <DeleteMeetingButton id={id} title={title} />
      </span>
      <span className="sm:hidden">
        <DropMenu
          label={t("Meeting actions")}
          trigger={<DotsIcon className="h-4 w-4" />}
          width={240}
          className={ICON_BUTTON}
        >
          {(close) => (
            <>
              <button
                type="button"
                role="menuitem"
                onClick={() => void close().then(togglePin)}
                className={MENU_ITEM}
              >
                <PinGlyph className="h-3.5 w-3.5" />
                {pinLabel}
              </button>
              {next ? (
                <Link href={next} role="menuitem" onClick={() => void close()} className={MENU_ITEM}>
                  <CalendarPlusIcon className="h-3.5 w-3.5" />
                  {t("Next meeting in this series")}
                </Link>
              ) : null}
              <MenuRule />
              <DeleteMeetingButton id={id} title={title} onPick={close} />
            </>
          )}
        </DropMenu>
      </span>
    </>
  );
}
