import { JOB_LABEL, isJobKind } from "./types";

/**
 * A job kind in the reader's language.
 *
 * The labels are keys spelled out here so the translation table's test can see them; a key that
 * only exists at run time is one it cannot. Imports nothing from React, so both the live queue
 * (in the browser) and its history (rendered on the server) use the one table.
 */
export function jobLabel(t: (k: string) => string, kind: string): string {
  const table: Record<string, string> = {
    Minutes: t("Minutes"),
    "Re-transcribe": t("Re-transcribe"),
    Diarize: t("Diarize"),
    "Encrypting your older meetings": t("Encrypting your older meetings"),
  };
  const label = isJobKind(kind) ? JOB_LABEL[kind] : kind;
  return table[label] ?? label;
}

/**
 * What is using the card right now, as a phrase: "Diarizing…" rather than "Diarize".
 *
 * For the notes that say why something has to wait (Ask, the minutes card, the transcript, the
 * header's warm-up). They used to say "Generating minutes…" whatever was running, because
 * /api/busy reports every kind of job and the screens only ever had the one phrase for it.
 */
export function busyLabel(t: (k: string) => string, kind: string | null | undefined): string {
  switch (kind) {
    case "minutes":
      return t("Generating minutes…");
    case "diarize":
      return t("Diarizing…");
    case "emotion":
      return t("Judging emotion…");
    case "transcribe":
      return t("Transcribing…");
    case "recording":
      return t("Recording in progress…");
    case "encrypt":
      return t("Encrypting your older meetings");
    default:
      return t("A GPU task is running");
  }
}
