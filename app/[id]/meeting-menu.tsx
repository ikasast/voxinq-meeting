"use client";

import { DropMenu, MenuRule } from "../drop-menu";
import { DotsIcon } from "../icons";
import { useT } from "../locale-provider";
import { ArchiveButton } from "./archive-button";
import { CloneMeetingButton } from "./clone-meeting-button";
import { DeleteMeetingButton } from "./delete-meeting-button";

// The meeting's "…" beside its title: what is done to the meeting as a whole and seldom — start
// the next one like it, archive it, bin it. Three outlined buttons in a box of their own used to
// sit there, and they were most of what the top of the page looked like.

export function MeetingMenu({
  id,
  title,
  description,
  tags,
  series,
  archived,
}: {
  id: string;
  title: string;
  description: string | null;
  tags: string[];
  series: string | null;
  archived: boolean;
}) {
  const t = useT();
  return (
    <DropMenu
      label={t("Meeting actions")}
      trigger={<DotsIcon className="h-4 w-4" />}
      width={240}
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--hover-surface)] hover:text-[var(--foreground)]"
    >
      {(close) => (
        <>
          <CloneMeetingButton description={description} tags={tags} series={series} onPick={close} />
          <ArchiveButton id={id} archived={archived} variant="menu" onPick={close} />
          <MenuRule />
          <DeleteMeetingButton id={id} title={title} onPick={close} />
        </>
      )}
    </DropMenu>
  );
}
