"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// Title display with inline editing. Pencil button -> input field,
// Enter/Save issues a PATCH, Esc/Cancel discards.
export function MeetingTitle({ id, title }: { id: string; title: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(title);
  const [saved, setSaved] = useState(title);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cancel = () => {
    setValue(saved);
    setError(null);
    setEditing(false);
  };

  const save = async () => {
    const trimmed = value.trim();
    if (!trimmed || trimmed === saved) {
      cancel();
      return;
    }
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/meetings/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: trimmed }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? `HTTP ${res.status}`);
      }
      setSaved(trimmed);
      setValue(trimmed);
      setEditing(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setPending(false);
    }
  };

  if (!editing) {
    return (
      <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-[var(--text-strong)]">
        {saved}
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label="Edit meeting title"
          title="Edit meeting title"
          className="rounded p-1 text-base text-[var(--text-muted)] hover:bg-[var(--elevated)] hover:text-[var(--text-strong)]"
        >
          ✎
        </button>
      </h1>
    );
  }

  return (
    <div>
      {/* On phones the input takes a full row and the buttons wrap to the next line */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) save();
            if (e.key === "Escape") cancel();
          }}
          maxLength={200}
          autoFocus
          disabled={pending}
          className="input w-full text-xl font-semibold sm:w-auto sm:flex-1"
        />
        <button type="button" onClick={save} disabled={pending} className="btn-ink shrink-0">
          {pending ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={cancel} disabled={pending} className="btn-outline shrink-0">
          Cancel
        </button>
      </div>
      {error ? <p className="mt-1 text-sm text-[var(--error)]">{error}</p> : null}
    </div>
  );
}
