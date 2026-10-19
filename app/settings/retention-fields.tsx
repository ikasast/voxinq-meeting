"use client";

import { useEffect, useState } from "react";
import { useT } from "@/app/locale-provider";
import { FieldRow } from "@/app/field-row";
import { RECORDING_RETENTION_CHOICES, TRASH_RETENTION_CHOICES } from "@/lib/retention-choices";
import { MachineNote } from "./machine-note";

// Settings → Data: how long the recordings and the trash are kept. The machine's, so only an
// administrator changes them. The transcripts and the minutes are not affected by either.
//
// Until somebody chooses, the recordings follow the transcription service's own period
// (STT_RECORDING_RETENTION_DAYS); the choice says what that is, from the service.

export function RetentionFields({
  recordingDays,
  trashDays,
  isAdmin,
  inputClass,
  onRecording,
  onTrash,
}: {
  recordingDays: number;
  trashDays: number;
  isAdmin: boolean;
  inputClass: string;
  onRecording: (days: number) => void;
  onTrash: (days: number) => void;
}) {
  const t = useT();
  const [serviceDays, setServiceDays] = useState<number | null>(null);

  useEffect(() => {
    if (recordingDays >= 0) return;
    let live = true;
    void fetch("/api/retention", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<{ recording: { days: number } | null }>) : null))
      .then((d) => {
        if (live) setServiceDays(d?.recording?.days ?? null);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [recordingDays]);

  const days = (n: number) =>
    n === 0 ? t("Keep until deleted by hand") : n === 365 ? t("Delete after 1 year") : t("Delete after {n} days", { n });

  return (
    <>
      <FieldRow
        label={t("Recordings")}
        htmlFor="recordingRetentionDays"
        hint={t("The audio of a recording that is not protected. Transcripts and minutes are kept either way.")}
      >
        <select
          id="recordingRetentionDays"
          value={String(recordingDays)}
          onChange={(e) => onRecording(Number(e.target.value))}
          disabled={!isAdmin}
          className={`${inputClass} max-w-sm`}
        >
          {recordingDays < 0 ? (
            <option value="-1">
              {serviceDays === null
                ? t("As the transcription service is set")
                : t("As the transcription service is set ({period})", { period: days(serviceDays) })}
            </option>
          ) : null}
          {RECORDING_RETENTION_CHOICES.map((n) => (
            <option key={n} value={n}>
              {days(n)}
            </option>
          ))}
        </select>
        <MachineNote isAdmin={isAdmin} />
      </FieldRow>
      <FieldRow
        label={t("Trash")}
        htmlFor="trashRetentionDays"
        hint={t("A meeting in the trash is deleted for good after this, recording and all.")}
      >
        <select
          id="trashRetentionDays"
          value={String(trashDays)}
          onChange={(e) => onTrash(Number(e.target.value))}
          disabled={!isAdmin}
          className={`${inputClass} max-w-sm`}
        >
          {TRASH_RETENTION_CHOICES.map((n) => (
            <option key={n} value={n}>
              {t("Delete after {n} days", { n })}
            </option>
          ))}
        </select>
      </FieldRow>
    </>
  );
}
