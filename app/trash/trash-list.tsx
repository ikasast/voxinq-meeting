"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { formatDateTimeIn } from "@/lib/i18n/format";
import { useConfirm } from "../confirm-dialog";
import { useLocale, useT } from "../locale-provider";
import { RestoreIcon, TrashIcon } from "../icons";

type TrashItem = {
  id: string;
  title: string;
  deletedAt: string;
  startedAt: string;
  transcriptCount: number;
  summaryCount: number;
};

export function TrashList() {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const confirm = useConfirm();
  const [items, setItems] = useState<TrashItem[] | null>(null);
  const [purgeAfterDays, setPurgeAfterDays] = useState(30);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/trash", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { purgeAfterDays: number; meetings: TrashItem[] };
      setItems(data.meetings);
      setPurgeAfterDays(data.purgeAfterDays);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("Failed to load"));
    }
  }, [t]);
  useEffect(() => {
    void load();
  }, [load]);

  const restore = async (id: string) => {
    setBusy(id);
    try {
      const res = await fetch(`/api/meetings/${id}/restore`, { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setItems((prev) => prev?.filter((m) => m.id !== id) ?? null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("Failed to restore"));
    } finally {
      setBusy(null);
    }
  };

  const purge = async (id: string, title: string) => {
    const ok = await confirm({
      title,
      message: t(
        "Permanently delete this meeting. The transcript, minutes, and recording will all be lost and cannot be recovered.",
      ),
      confirmLabel: t("Delete permanently"),
      danger: true,
    });
    if (!ok) return;
    setBusy(id);
    try {
      const res = await fetch(`/api/meetings/${id}?permanent=1`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setItems((prev) => prev?.filter((m) => m.id !== id) ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("Failed to delete"));
    } finally {
      setBusy(null);
    }
  };

  // v4: a plain page like the queue's — a title, a line on what this is, and the meetings as
  // rows between rules, each with its two actions as quiet buttons at the end.
  return (
    <div data-paper className="mx-auto max-w-3xl space-y-4 pt-2 lg:pt-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-strong)]">{t("Trash")}</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          {t(
            "Deleted meetings are permanently removed after {n} days. Until then, you can restore them.",
            { n: purgeAfterDays },
          )}
        </p>
      </div>

      {error ? <p className="text-sm text-[var(--error)]">{error}</p> : null}

      {items === null ? (
        <p className="text-sm text-[var(--text-muted)]">{t("Loading…")}</p>
      ) : items.length === 0 ? (
        <p className="border-y border-[var(--border)] py-6 text-sm text-[var(--text-muted)]">{t("The trash is empty.")}</p>
      ) : (
        <ul className="divide-y divide-[var(--border)] border-y border-[var(--border)]">
          {items.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-[var(--text-strong)]">{m.title}</p>
                <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                  {formatDateTimeIn(locale, m.startedAt)} ·{" "}
                  {t(m.transcriptCount === 1 ? "1 utterance" : "{n} utterances", {
                    n: m.transcriptCount,
                  })}{" "}
                  /{" "}
                  {t(m.summaryCount === 1 ? "1 set of minutes" : "{n} sets of minutes", {
                    n: m.summaryCount,
                  })}{" "}
                  · {t("deleted {when}", { when: formatDateTimeIn(locale, m.deletedAt) })}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => void restore(m.id)}
                  disabled={busy === m.id}
                  className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-[var(--accent-sub)] hover:bg-[var(--hover-surface)] disabled:opacity-50"
                >
                  <RestoreIcon className="h-3.5 w-3.5" />
                  {t("Restore")}
                </button>
                <button
                  type="button"
                  onClick={() => void purge(m.id, m.title)}
                  disabled={busy === m.id}
                  title={t("Delete permanently")}
                  aria-label={`${t("Delete permanently")}: ${m.title}`}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--hover-surface)] hover:text-[var(--error)] disabled:opacity-50"
                >
                  <TrashIcon className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
