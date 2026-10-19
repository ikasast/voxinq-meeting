"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useConfirm } from "@/app/confirm-dialog";
import { useT } from "@/app/locale-provider";

// The recordings on the storage screen, largest first, with what can be done to them: protect
// one from the automatic deletion, let it go again, or delete it now. One at a time from its
// row, or several from the bar that appears once any are ticked.
//
// Deleting takes the audio only; the transcript and the minutes stay. The confirmation says
// what is lost with it — playing it back and doing the recognition or the speakers again.

export type RecordingRow = {
  id: string;
  title: string;
  when: string;
  size: string;
  /** Bar width, 0–100, against the largest. */
  bar: number;
  color: string;
  fate: "protected" | "kept" | "expiring" | "trash";
  /** Days until the automatic deletion, for one that has a date. */
  daysLeft: number | null;
};

const SHOWN = 10;

export function RecordingList({ rows }: { rows: RecordingRow[] }) {
  const t = useT();
  const router = useRouter();
  const confirm = useConfirm();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [all, setAll] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const act = async (ids: string[], action: "protect" | "unprotect" | "delete") => {
    if (ids.length === 0) return;
    if (action === "delete") {
      const ok = await confirm({
        message: t(
          ids.length === 1
            ? "Delete this recording? The transcript and the minutes stay, but it can no longer be played, transcribed again or have its speakers separated again."
            : "Delete {n} recordings? The transcripts and the minutes stay, but they can no longer be played, transcribed again or have their speakers separated again.",
          { n: ids.length },
        ),
        confirmLabel: t("Delete"),
        danger: true,
      });
      if (!ok) return;
    }
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/storage/recordings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, action }),
      });
      const d = (await res.json().catch(() => null)) as { done?: string[]; skipped?: string[]; error?: string } | null;
      if (!res.ok) throw new Error(d?.error ?? `HTTP ${res.status}`);
      if (d?.skipped?.length) {
        setNote(
          t("{n} left as they were: being recorded or worked on, or the transcription service did not answer.", {
            n: d.skipped.length,
          }),
        );
      }
      setPicked(new Set());
      router.refresh();
    } catch (e) {
      setNote((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const toggle = (id: string) =>
    setPicked((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const shown = all ? rows : rows.slice(0, SHOWN);
  const chosen = [...picked];
  const btn =
    "shrink-0 rounded-md border border-[var(--border-strong)] px-2 py-0.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--hover-surface)] disabled:opacity-50";

  return (
    <div className="space-y-2">
      <ul className="divide-y divide-[var(--border)] border-y border-[var(--border)]">
        {shown.map((r) => (
          <li key={r.id} className="flex items-start gap-3 py-2.5">
            <input
              type="checkbox"
              className="mt-1 shrink-0"
              checked={picked.has(r.id)}
              onChange={() => toggle(r.id)}
              aria-label={t("Choose {title}", { title: r.title })}
              disabled={busy}
            />
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-baseline justify-between gap-3">
                <Link
                  href={`/${r.id}`}
                  className="min-w-0 truncate text-sm font-medium text-[var(--text-strong)] hover:text-[var(--accent-sub)]"
                >
                  {r.title}
                </Link>
                <span className="shrink-0 text-sm tabular-nums text-[var(--text-strong)]">{r.size}</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--elevated)]">
                <div className="h-full rounded-full" style={{ width: `${r.bar}%`, background: r.color }} />
              </div>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs text-[var(--text-muted)]">
                <span>{r.when}</span>
                <span>
                  {r.fate === "protected"
                    ? t("Protected")
                    : r.fate === "trash"
                      ? t("In the trash")
                      : r.daysLeft !== null
                        ? t(r.daysLeft <= 1 ? "Deleted within 1 day" : "Deleted in {n} days", { n: r.daysLeft })
                        : t("Kept")}
                </span>
                <span className="ml-auto flex gap-1.5">
                  {r.fate === "trash" ? null : (
                    <button
                      type="button"
                      className={btn}
                      disabled={busy}
                      onClick={() => void act([r.id], r.fate === "protected" ? "unprotect" : "protect")}
                    >
                      {r.fate === "protected" ? t("Unprotect") : t("Protect")}
                    </button>
                  )}
                  <button
                    type="button"
                    className={`${btn} text-[var(--error)]`}
                    disabled={busy}
                    onClick={() => void act([r.id], "delete")}
                  >
                    {t("Delete")}
                  </button>
                </span>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {rows.length > SHOWN && !all ? (
        <button type="button" onClick={() => setAll(true)} className="text-xs text-[var(--accent-sub)] hover:underline">
          {t("Show all {n}", { n: rows.length })}
        </button>
      ) : null}

      {chosen.length > 0 ? (
        <div className="sticky bottom-2 flex flex-wrap items-center gap-2 rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 shadow-lg">
          <span className="text-xs text-[var(--text-secondary)]">{t("{n} chosen", { n: chosen.length })}</span>
          <button type="button" className={btn} disabled={busy} onClick={() => void act(chosen, "protect")}>
            {t("Protect")}
          </button>
          <button type="button" className={btn} disabled={busy} onClick={() => void act(chosen, "unprotect")}>
            {t("Unprotect")}
          </button>
          <button
            type="button"
            className={`${btn} text-[var(--error)]`}
            disabled={busy}
            onClick={() => void act(chosen, "delete")}
          >
            {t("Delete recordings")}
          </button>
          <button
            type="button"
            className="ml-auto text-xs text-[var(--text-muted)] hover:underline"
            onClick={() => setPicked(new Set())}
          >
            {t("Clear")}
          </button>
        </div>
      ) : null}

      {note ? <p className="text-xs text-[var(--warning)]">{note}</p> : null}
    </div>
  );
}
