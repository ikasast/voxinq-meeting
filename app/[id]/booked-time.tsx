"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PencilIcon } from "../icons";
import { useT } from "@/app/locale-provider";

/** An instant as `datetime-local` wants it: wall-clock time on this device, to the minute. */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// When a booked meeting is due, and a way to move it.
//
// Booking was the only moment a time could be given: a meeting moved to Thursday had to be
// deleted and booked again, agenda and participants with it. The pencil sits next to the time,
// like the title's. Only rendered for a meeting that is still only a booking; the route refuses
// the rest anyway.
//
// The phone's notice follows on its own: its next check sets the alarm for the new time, and
// an alarm left at the old time finds the server no longer calling the meeting due.
export function BookedTime({ id, at, label }: { id: string; at: string; label: string }) {
  const router = useRouter();
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Read from the instant only when editing starts: the server renders without knowing this
  // device's time zone, so a value computed during render would not match after hydration.
  const start = () => {
    setValue(toLocalInput(at));
    setError(null);
    setEditing(true);
  };

  const save = async () => {
    if (!value) return;
    // datetime-local has no zone; new Date() reads it as this device's wall-clock time, which
    // is what somebody typing "Thursday 14:00" means. The same as booking it in the first place.
    const next = new Date(value);
    if (Number.isNaN(next.getTime())) return;
    if (next.getTime() === new Date(at).getTime()) {
      setEditing(false);
      return;
    }
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/meetings/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduledAt: next.toISOString() }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? `HTTP ${res.status}`);
      }
      setEditing(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("Failed to save"));
    } finally {
      setPending(false);
    }
  };

  if (!editing) {
    return (
      <>
        {label}
        <button
          type="button"
          onClick={start}
          aria-label={t("Change the booked time")}
          title={t("Change the booked time")}
          className="ml-1 inline-flex rounded p-0.5 align-middle text-[var(--text-muted)] hover:bg-[var(--elevated)] hover:text-[var(--text-strong)]"
        >
          <PencilIcon className="h-3.5 w-3.5" />
        </button>
      </>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2 align-middle">
      <input
        type="datetime-local"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void save();
          if (e.key === "Escape") setEditing(false);
        }}
        autoFocus
        disabled={pending}
        aria-label={t("Change the booked time")}
        className="input py-1 text-sm"
      />
      <button type="button" onClick={() => void save()} disabled={pending || !value} className="btn-ink shrink-0 !py-1 !text-xs">
        {pending ? t("Saving…") : t("Save")}
      </button>
      <button type="button" onClick={() => setEditing(false)} disabled={pending} className="btn-outline shrink-0 !py-1 !text-xs">
        {t("Cancel")}
      </button>
      {error ? <span className="w-full text-xs text-[var(--error)]">{error}</span> : null}
    </span>
  );
}
