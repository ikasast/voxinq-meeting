"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { useT } from "../locale-provider";

// A series made before its first meeting, so its background and regular members can be written
// first. Only the name here: everything else is the series page's own editor, which this opens
// straight into, rather than a second form for the same fields.
export function NewSeriesButton() {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/series", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const d = (await res.json().catch(() => null)) as { id?: string; error?: string } | null;
      if (!res.ok || !d?.id) throw new Error(d?.error ?? `HTTP ${res.status}`);
      router.push(`/series/${d.id}?edit=1`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("Could not create the series."));
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn-ink">
        {t("New series")}
      </button>
    );
  }
  return (
    <form onSubmit={(e) => void create(e)} className="flex flex-wrap items-center gap-2">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={60}
        placeholder={t("Series name")}
        aria-label={t("Series name")}
        disabled={busy}
        className="input w-48"
      />
      <button type="submit" disabled={busy || !name.trim()} className="btn-ink">
        {busy ? t("Creating…") : t("Create")}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          setOpen(false);
          setName("");
          setError(null);
        }}
        className="btn-outline"
      >
        {t("Cancel")}
      </button>
      {error ? <span className="basis-full text-xs text-[var(--error)]">{error}</span> : null}
    </form>
  );
}
