"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useConfirm } from "../confirm-dialog";
import { TrashIcon } from "../icons";
import { useT } from "@/app/locale-provider";
import { MENU_ITEM } from "../drop-menu";

// Delete button on the detail page. Confirm -> DELETE -> back to the list.
// As a row of the meeting's "…" menu when `onPick` is given: the menu goes first, so the
// confirmation's Back entry sits on the page and not on top of the menu's.
export function DeleteMeetingButton({
  id,
  title,
  onPick,
}: {
  id: string;
  title: string;
  onPick?: () => Promise<void>;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [deleting, setDeleting] = useState(false);
  const t = useT();

  const remove = async () => {
    const ok = await confirm({
      title,
      message: t("Move this meeting to the trash. You can restore it within 30 days."),
      confirmLabel: t("Delete"),
      danger: true,
    });
    if (!ok) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/meetings/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const detail = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(detail?.error ?? `HTTP ${res.status}`);
      }
      router.replace("/");
      router.refresh();
    } catch (err) {
      await confirm({
        title: t("Failed to delete"),
        message: err instanceof Error ? err.message : String(err),
        alertOnly: true,
      });
      setDeleting(false);
    }
  };

  if (onPick) {
    return (
      <button
        type="button"
        role="menuitem"
        onClick={() => void onPick().then(remove)}
        disabled={deleting}
        className={`${MENU_ITEM} !text-[var(--error)]`}
      >
        <TrashIcon className="h-3.5 w-3.5" />
        {t("Move to Trash")}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={remove}
      disabled={deleting}
      title={t("Move to Trash (restorable for 30 days)")}
      aria-label={t("Move to Trash")}
      className="btn-icon !text-[var(--error)] hover:!bg-[color-mix(in_srgb,var(--error)_12%,transparent)]"
    >
      <TrashIcon className={deleting ? "h-4 w-4 animate-pulse" : "h-4 w-4"} />
    </button>
  );
}
