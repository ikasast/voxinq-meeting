"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useConfirmEx } from "../../confirm-dialog";
import { useT } from "../../locale-provider";
import { ICON_BUTTON } from "../../drop-menu";
import { TrashIcon } from "../../icons";

// Offered only while nothing is filed under the series. See the DELETE route for why a series
// with meetings in it — even trashed ones — is not deletable at all.
export function DeleteSeriesButton({ id, name }: { id: string; name: string }) {
  const t = useT();
  const router = useRouter();
  const confirm = useConfirmEx();
  const [error, setError] = useState<string | null>(null);

  const remove = async () => {
    const { ok } = await confirm({
      title: name,
      message: t("Delete this series? It has no meetings, so nothing else is removed."),
      confirmLabel: t("Delete"),
      danger: true,
    });
    if (!ok) return;
    const res = await fetch(`/api/series/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const d = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(d?.error ?? `HTTP ${res.status}`);
      return;
    }
    router.replace("/series");
    router.refresh();
  };

  return (
    <span className="inline-flex items-center gap-2">
      {error ? <span className="text-xs text-[var(--error)]">{error}</span> : null}
      <button
        type="button"
        onClick={() => void remove()}
        title={t("Delete this series")}
        aria-label={t("Delete this series")}
        className={`${ICON_BUTTON} hover:!bg-[color-mix(in_srgb,var(--error)_12%,transparent)] hover:!text-[var(--error)]`}
      >
        <TrashIcon className="h-4 w-4" />
      </button>
    </span>
  );
}
