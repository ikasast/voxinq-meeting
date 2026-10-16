"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useT } from "./locale-provider";
import { formatDateTimeIn } from "@/lib/i18n/format";
import { fileOf, listLocal, removeLocal, sendLocal, type LocalRecording } from "@/lib/local-recordings";
import { useConfirm } from "./confirm-dialog";

// Recordings this browser holds that the server does not have yet (lib/local-recordings.ts): a
// copy that outlived a long drop or a closed tab, or one made on the offline page while the server
// could not be reached. Said at the top of every page until they are sent or deleted.

export function LocalRecordingsBanner() {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const confirm = useConfirm();
  const [items, setItems] = useState<LocalRecording[]>([]);
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    listLocal()
      .then(setItems)
      .catch(() => setItems([]));
  }, []);
  useEffect(() => {
    load();
    window.addEventListener("online", load);
    return () => window.removeEventListener("online", load);
  }, [load]);

  if (items.length === 0) return null;

  const sendAll = async () => {
    setSending(true);
    setError(null);
    for (const rec of items) {
      try {
        await sendLocal(rec, (title) => t("{title} (copy from this device)", { title }));
      } catch (e) {
        setError(t("Could not send: {reason}", { reason: (e as Error).message }));
        break;
      }
    }
    setSending(false);
    load();
    router.refresh();
  };

  const save = async (rec: LocalRecording) => {
    const blob = await fileOf(rec);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `voxinq-${new Date(rec.startedAt).toISOString().replace(/[:.]/g, "-")}.${rec.format === "pcm16k" ? "wav" : rec.mimeType?.includes("mp4") ? "m4a" : "webm"}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  const remove = async (rec: LocalRecording) => {
    const ok = await confirm({
      message: t("Delete this recording from this device? It has not been sent."),
      confirmLabel: t("Delete"),
      danger: true,
    });
    if (!ok) return;
    await removeLocal(rec.id).catch(() => {});
    load();
  };

  const minutes = (rec: LocalRecording) => {
    const ms = rec.format === "pcm16k" ? (rec.bytes / 32_000) * 1000 : (rec.endedAt ?? rec.updatedAt) - rec.startedAt;
    return Math.max(1, Math.round(ms / 60_000));
  };

  return (
    <div role="status" className="border-b border-[color-mix(in_srgb,var(--warning)_35%,transparent)] bg-[color-mix(in_srgb,var(--warning)_10%,var(--paper))] px-4 py-2 text-sm text-[var(--foreground)] lg:px-8">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-3 gap-y-1">
        <span className="min-w-0 flex-1">
          {t(items.length === 1 ? "This device holds 1 recording the server does not have yet." : "This device holds {n} recordings the server does not have yet.", {
            n: items.length,
          })}
        </span>
        <button type="button" onClick={() => void sendAll()} disabled={sending} className="btn-soft !px-3 !py-1 !text-xs">
          {sending ? t("Sending…") : t("Send")}
        </button>
        <button type="button" onClick={() => setOpen((o) => !o)} className="btn-outline !px-3 !py-1 !text-xs">
          {open ? t("Close") : t("Show them")}
        </button>
        {error ? <span className="w-full text-xs text-[var(--error)]">{error}</span> : null}
      </div>
      {open ? (
        <ul className="mx-auto mt-2 max-w-[1400px] divide-y divide-[var(--border)] border-t border-[var(--border)]">
          {items.map((rec) => (
            <li key={rec.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5 text-xs">
              <span className="min-w-0 flex-1">
                {rec.kind === "copy" && rec.title
                  ? t("{title} (copy from this device)", { title: rec.title })
                  : t("Recorded on this device")}
                <span className="ml-2 text-[var(--text-muted)]">
                  {formatDateTimeIn(locale, new Date(rec.startedAt))} · {t("{n} min", { n: minutes(rec) })}
                </span>
              </span>
              <button type="button" onClick={() => void save(rec)} className="text-[var(--accent-sub)] hover:underline">
                {t("Save as a file")}
              </button>
              <button type="button" onClick={() => void remove(rec)} className="text-[var(--text-muted)] hover:text-[var(--error)]">
                {t("Delete")}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
