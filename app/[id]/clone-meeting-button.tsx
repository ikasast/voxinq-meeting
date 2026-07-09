"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { defaultMeetingTitle } from "@/lib/utils";

// Create a new meeting inheriting the purpose/tags and go straight to recording (for recurring meetings).
export function CloneMeetingButton({
  description,
  tags,
}: {
  description: string | null;
  tags: string[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const clone = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/meetings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: defaultMeetingTitle(),
          description: description ?? "",
          tags,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const m = (await res.json()) as { id: string };
      router.push(`/${m.id}/recording?autostart=1`);
    } catch {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={clone}
      disabled={busy}
      title="Create a new meeting inheriting this meeting's purpose and tags"
      className="btn-outline"
    >
      {busy ? "Creating…" : "New with same settings"}
    </button>
  );
}
