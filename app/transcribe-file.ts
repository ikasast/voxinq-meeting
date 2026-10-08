// A recording from a file becomes a meeting: create it named after the file, hand the server the
// audio, end it, and queue the recognition with the minutes after it. Everything past the upload
// is the queue's, so the tab can close as soon as this returns.
//
// Shared by the three ways a file arrives in v4: dropped anywhere (drop-to-transcribe.tsx), picked
// from the first screen's "Audio file" (home-start.tsx), and the New meeting form.

/** What a dropped or picked file has to look like to be taken as a recording. */
export const AUDIO_EXT = /\.(wav|mp3|m4a|aac|ogg|oga|opus|flac|webm|mp4|m4v|mov|mkv|wma)$/i;

export function isRecordingFile(file: File): boolean {
  return file.type.startsWith("audio/") || file.type.startsWith("video/") || AUDIO_EXT.test(file.name);
}

/** The new meeting's id, once the file is with the server and the work is queued. */
export async function transcribeFile(
  file: File,
  onPhase?: (phase: "creating" | "uploading" | "queueing") => void,
): Promise<string> {
  onPhase?.("creating");
  const created = await fetch("/api/meetings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: file.name.replace(/\.[^.]+$/, ""), description: "" }),
  });
  if (!created.ok) {
    const d = (await created.json().catch(() => null)) as { error?: string } | null;
    throw new Error(d?.error ?? `HTTP ${created.status}`);
  }
  const { id } = (await created.json()) as { id: string };

  onPhase?.("uploading");
  const up = await fetch(`/api/meetings/${id}/recording`, {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: file,
  });
  if (!up.ok) {
    const d = (await up.json().catch(() => null)) as { error?: string } | null;
    throw new Error(d?.error ?? `Upload failed (HTTP ${up.status})`);
  }
  // It happened before the file existed, so it is over.
  await fetch(`/api/meetings/${id}/end`, { method: "POST" }).catch(() => {});

  onPhase?.("queueing");
  // The model, the language and the rest come from the settings, as for any recording.
  const queued = await fetch(`/api/meetings/${id}/transcribe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ thenMinutes: true }),
  });
  if (!queued.ok) {
    const d = (await queued.json().catch(() => null)) as { error?: string } | null;
    throw new Error(d?.error ?? `Could not queue the transcription (HTTP ${queued.status})`);
  }
  return id;
}
