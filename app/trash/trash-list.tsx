"use client";

import Link from "next/link";
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
  tags: string[];
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="eyebrow">{t("Trash")}</p>
          <p className="eyebrow-sub">{t("Deleted meetings")}</p>
        </div>
        <Link href="/" className="btn-outline shrink-0">
          {t("Back to list")}
        </Link>
      </div>

      <p className="text-sm text-[var(--text-muted)]">
        {t(
          "Deleted meetings are permanently removed after {n} days. Until then, you can restore them.",
          { n: purgeAfterDays },
        )}
      </p>

      {error ? <p className="text-sm text-[var(--error)]">{error}</p> : null}

      {items === null ? (
        <p className="text-sm text-[var(--text-muted)]">{t("Loading…")}</p>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--surface)] p-12 text-center">
          <p className="text-[var(--text-secondary)]">{t("The trash is empty.")}</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((m) => (
            <li
              key={m.id}
              className="card flex flex-wrap items-center justify-between gap-3 p-4"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-[var(--text-strong)]">{m.title}</p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
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
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={() => void restore(m.id)}
                  disabled={busy === m.id}
                  className="btn-soft"
                  title={t("Restore")}
                >
                  <RestoreIcon />
                  {t("Restore")}
                </button>
                <button
                  type="button"
                  onClick={() => void purge(m.id, m.title)}
                  disabled={busy === m.id}
                  className="inline-flex items-center gap-2 rounded-full border border-[color-mix(in_srgb,var(--error)_50%,transparent)] px-4 py-2 text-sm text-[var(--error)] hover:bg-[color-mix(in_srgb,var(--error)_15%,transparent)] disabled:opacity-50"
                  title={t("Delete permanently")}
                >
                  <TrashIcon />
                  {t("Delete")}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
