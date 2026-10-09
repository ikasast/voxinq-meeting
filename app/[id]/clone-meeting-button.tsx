"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PlusCircleIcon } from "../icons";
import { useT } from "@/app/locale-provider";
import { MENU_ITEM } from "../drop-menu";

// Create a new meeting inheriting the purpose/tags/series and go straight to recording (for recurring meetings).
// As a row of the meeting's "…" menu when `onPick` is given: it closes the menu first.
export function CloneMeetingButton({
  description,
  tags,
  series,
  onPick,
}: {
  description: string | null;
  tags: string[];
  series: string | null;
  onPick?: () => Promise<void>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const t = useT();

  const clone = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/meetings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: description ?? "",
          tags,
          series: series ?? "",
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const m = (await res.json()) as { id: string };
      router.push(`/${m.id}/recording?autostart=1`);
    } catch {
      setBusy(false);
    }
  };

  if (onPick) {
    return (
      <button
        type="button"
        role="menuitem"
        onClick={() => void onPick().then(clone)}
        disabled={busy}
        className={MENU_ITEM}
      >
        <PlusCircleIcon className="h-3.5 w-3.5" />
        {t("New with same settings")}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={clone}
      disabled={busy}
      title={t(
        "New with same settings — start a new meeting inheriting this one’s purpose, tags, and series",
      )}
      aria-label={t("New with same settings")}
      className="btn-icon"
    >
      <PlusCircleIcon className={busy ? "h-4 w-4 animate-pulse" : "h-4 w-4"} />
    </button>
  );
}
