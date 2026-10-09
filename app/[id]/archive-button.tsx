"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArchiveIcon } from "../icons";
import { useT } from "@/app/locale-provider";
import { MENU_ITEM } from "../drop-menu";

// Archive / unarchive a meeting. Archived meetings are hidden from the list but stay in the
// DB, appear in search, and are all listed on /archive.
export function ArchiveButton({
  id,
  archived,
  variant = "icon",
  onPick,
}: {
  id: string;
  archived: boolean;
  variant?: "icon" | "text" | "menu";
  /** With `variant="menu"`: closes the menu the row is in, before anything happens. */
  onPick?: () => Promise<void>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const t = useT();

  const toggle = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/meetings/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: !archived }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      router.refresh();
    } catch {
      /* keep the button usable */
    } finally {
      setBusy(false);
    }
  };

  const label = archived ? t("Unarchive") : t("Archive");
  const title = archived
    ? t("Unarchive: show this meeting in the list again")
    : t("Archive: hide from the list (still searchable, listed under Archived)");

  if (variant === "menu") {
    return (
      <button
        type="button"
        role="menuitem"
        onClick={() => void (onPick ? onPick() : Promise.resolve()).then(toggle)}
        disabled={busy}
        title={title}
        className={MENU_ITEM}
      >
        <ArchiveIcon className="h-3.5 w-3.5" />
        {label}
      </button>
    );
  }
  if (variant === "text") {
    return (
      <button type="button" onClick={toggle} disabled={busy} title={title} className="btn-outline">
        {busy ? "…" : label}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      title={title}
      aria-label={label}
      className={`btn-icon ${archived ? "!text-[var(--accent-sub)]" : ""}`}
    >
      <ArchiveIcon className={busy ? "h-4 w-4 animate-pulse" : "h-4 w-4"} />
    </button>
  );
}
