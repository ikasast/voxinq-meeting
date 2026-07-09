"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// Archive / unarchive a meeting. Archived meetings are hidden from the list but stay in the
// DB and reappear in search results.
export function ArchiveButton({ id, archived }: { id: string; archived: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

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
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      title={
        archived
          ? "Unarchive: show this meeting in the list again"
          : "Archive: hide from the list (still searchable)"
      }
      className="btn-outline"
    >
      {busy ? "…" : archived ? "Unarchive" : "Archive"}
    </button>
  );
}
