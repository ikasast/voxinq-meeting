"use client";

import { useRouter } from "next/navigation";
import { DropMenu, MENU_ITEM, MenuRule } from "../drop-menu";
import { DotsIcon, PinIcon, PinnedIcon } from "../icons";
import { useT } from "../locale-provider";
import { ArchiveButton } from "./archive-button";
import { CloneMeetingButton } from "./clone-meeting-button";
import { DeleteMeetingButton } from "./delete-meeting-button";

// The meeting's "…" beside its title: what is done to the meeting as a whole and seldom — start
// the next one like it, archive it, bin it. Three outlined buttons in a box of their own used to
// sit there, and they were most of what the top of the page looked like.
//
// Pinning is here as well as on the sidebar's rows, because the sidebar lists only recent
// meetings: an older one is found by search or the full list, opened, and pinned from here.

export function MeetingMenu({
  id,
  title,
  description,
  tags,
  series,
  archived,
  pinned,
}: {
  id: string;
  title: string;
  description: string | null;
  tags: string[];
  series: string | null;
  archived: boolean;
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
  return (
    <DropMenu
      label={t("Meeting actions")}
      trigger={<DotsIcon className="h-4 w-4" />}
      width={240}
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--hover-surface)] hover:text-[var(--foreground)]"
    >
      {(close) => (
        <>
          <button
            type="button"
            role="menuitem"
            onClick={() => void close().then(togglePin)}
            className={MENU_ITEM}
          >
            {pinned ? <PinnedIcon className="h-3.5 w-3.5" /> : <PinIcon className="h-3.5 w-3.5" />}
            {pinned ? t("Unpin from the sidebar") : t("Pin to the sidebar")}
          </button>
          <CloneMeetingButton description={description} tags={tags} series={series} onPick={close} />
          <ArchiveButton id={id} archived={archived} variant="menu" onPick={close} />
          <MenuRule />
          <DeleteMeetingButton id={id} title={title} onPick={close} />
        </>
      )}
    </DropMenu>
  );
}
