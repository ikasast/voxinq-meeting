// Shared client helpers for the "interrupt minutes to record" gate. Used by every entry
// point that starts a live recording (New meeting, quick-record) so the check is identical.
//
// Recording needs the single GPU that minutes generation (Ollama) may be holding, so before
// starting we check freshly and, if the user confirms, abort the in-flight generation and let
// the VRAM free.

export type MinutesBusy = { busy: boolean; meetingId?: string };

// Fresh, authoritative check (not the polled hook state, which lags and starts false).
export async function currentMinutesBusy(): Promise<MinutesBusy> {
  try {
    const j = (await fetch("/api/busy", { cache: "no-store" }).then((r) =>
      r.ok ? r.json() : null,
    )) as { minutes?: { busy?: boolean; meetingId?: string } } | null;
    return { busy: Boolean(j?.minutes?.busy), meetingId: j?.minutes?.meetingId };
  } catch {
    return { busy: false };
  }
}

// Abort the running minutes generation and wait briefly so the model's VRAM is released
// before Whisper loads for the recording (avoids a transient out-of-memory).
export async function abortMinutesAndSettle(meetingId?: string): Promise<void> {
  await fetch("/api/claude/summary/abort", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ meetingId }),
  }).catch(() => {});
  await new Promise((r) => setTimeout(r, 1200));
}
