import { readMachineSettings } from "./settings";
import { sttInternalUrl } from "./stt/internal";

// How long what the machine holds is kept (Settings → Data).
//
// The recordings' period is the transcription service's to enforce: the files and the sweep are
// there. So the app sends it, when it is saved and on the hourly sweep, and the service keeps it
// on its volume. Until somebody chooses (-1), the service's own STT_RECORDING_RETENTION_DAYS
// stands, as it always has. The trash's period is the app's, and is read where it is used.

export async function trashRetentionDays(): Promise<number> {
  return (await readMachineSettings()).trashRetentionDays;
}

export type RecordingRetention = { days: number; from: "app" | "environment" } | null;

/** The period the service is enforcing now, or null when it does not answer. */
export async function recordingRetention(): Promise<RecordingRetention> {
  try {
    const res = await fetch(`${sttInternalUrl()}/retention`, { signal: AbortSignal.timeout(4000), cache: "no-store" });
    if (!res.ok) return null;
    const d = (await res.json()) as { days?: unknown; from?: unknown };
    return typeof d.days === "number" ? { days: d.days, from: d.from === "app" ? "app" : "environment" } : null;
  } catch {
    return null;
  }
}

/** Send the chosen period to the service. Nothing to send while it is left to the service. */
export async function pushRecordingRetention(days?: number): Promise<boolean> {
  const value = days ?? (await readMachineSettings()).recordingRetentionDays;
  if (value < 0) return true;
  try {
    const res = await fetch(`${sttInternalUrl()}/retention`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ days: value }),
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
