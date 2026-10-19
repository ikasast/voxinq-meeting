"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useT } from "../../locale-provider";
import { ICON_BUTTON } from "../../drop-menu";
import { PinIcon, PinnedIcon } from "../../icons";

// Pin the series to the top of the sidebar's series, or let it go again — the same as the pin on
// its sidebar row, for a series that is not among the seven shown there.
export function PinSeriesButton({ id, pinned }: { id: string; pinned: boolean }) {
  const t = useT();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const toggle = async () => {
    setBusy(true);
    const res = await fetch(`/api/series/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pinned: !pinned }),
    }).catch(() => null);
    setBusy(false);
    if (res?.ok) router.refresh();
  };

  return (
    <button
      type="button"
      onClick={() => void toggle()}
      disabled={busy}
      aria-pressed={pinned}
      title={pinned ? t("Unpin") : t("Pin")}
      aria-label={pinned ? t("Unpin") : t("Pin")}
      className={ICON_BUTTON}
    >
      {pinned ? <PinnedIcon className="h-4 w-4 text-[var(--accent)]" /> : <PinIcon className="h-4 w-4" />}
    </button>
  );
}
