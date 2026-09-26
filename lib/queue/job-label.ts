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
