// Whether minutes are being written right now, asked freshly -- for the things that would
// load a speech model and should not do it into a card the minutes are using (the warm-up
// before recording, and the header's "load it now" control).
//
// It used to also stop them: New meeting and quick-record asked "interrupt the minutes?" and
// aborted the generation for good. Taking the card for a recording is the recording page's
// question now (/api/queue/recording), which puts what it interrupts back in the queue.

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
