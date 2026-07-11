"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useConfirm } from "../confirm-dialog";
import { TrashIcon } from "../icons";

// Delete button on the detail page. Confirm -> DELETE -> back to the list.
export function DeleteMeetingButton({ id, title }: { id: string; title: string }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [deleting, setDeleting] = useState(false);

  const remove = async () => {
    const ok = await confirm({
      title,
      message: "Move this meeting to the trash. You can restore it within 30 days.",
      confirmLabel: "Delete",
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
      router.push("/");
      router.refresh();
    } catch (err) {
      await confirm({
        title: "Failed to delete",
        message: err instanceof Error ? err.message : String(err),
        alertOnly: true,
      });
      setDeleting(false);
    }
  };

  return (
    <button
      type="button"
      onClick={remove}
      disabled={deleting}
      title="Move to Trash (restorable for 30 days)"
      aria-label="Move to Trash"
      className="btn-icon !text-[var(--error)] hover:!bg-[color-mix(in_srgb,var(--error)_12%,transparent)]"
    >
      <TrashIcon className={deleting ? "h-4 w-4 animate-pulse" : "h-4 w-4"} />
    </button>
  );
}
